#![allow(clippy::comparison_chain)]

use std::hash::Hash;

use rayon::prelude::*;
use rspack_core::rspack_sources::ReplaceSource;
use rspack_core::{
  get_css_chunk_filename_template,
  rspack_sources::{ConcatSource, RawSource, Source, SourceExt},
  Chunk, ChunkKind, Module, ModuleType, ParserAndGenerator, PathData, Plugin, RenderManifestEntry,
  SourceType,
};
use rspack_core::{
  Compilation, CompilationArgs, CompilationParams, CompilerOptions, DependencyType,
  LibIdentOptions, PluginCompilationHookOutput, PublicPath,
};
use rspack_error::Result;
use rspack_hash::RspackHash;

use crate::parser_and_generator::CssParserAndGenerator;
use crate::utils::AUTO_PUBLIC_PATH_PLACEHOLDER_REGEX;
use crate::CssPlugin;

struct CssModuleDebugInfo<'a> {
  pub module: &'a dyn Module,
}

impl CssPlugin {
  fn render_chunk_to_source(
    compilation: &Compilation,
    chunk: &Chunk,
    ordered_css_modules: &[&dyn Module],
  ) -> rspack_error::Result<ConcatSource> {
    let module_sources = ordered_css_modules
      .iter()
      .map(|module| {
        let module_id = &module.identifier();
        let code_gen_result = compilation
          .code_generation_results
          .get(module_id, Some(&chunk.runtime));

        Ok(
          code_gen_result
            .get(&SourceType::Css)
            .map(|source| (CssModuleDebugInfo { module: *module }, source)),
        )
      })
      .collect::<Result<Vec<_>>>()?;

    let source = module_sources
      .into_par_iter()
      // TODO(hyf0): I couldn't think of a situation where a module doesn't have `Source`.
      // Should we return a Error if there is a `None` in `module_sources`?
      // Webpack doesn't throw. It just do a best-effort checking https://github.com/webpack/webpack/blob/5e3c4d0ddf8ae6a6e45fea42be4e8950fe49c0bb/lib/css/CssModulesPlugin.js#L565-L568
      .flatten()
      .fold(
        ConcatSource::default,
        |mut acc, (debug_info, cur_source)| {
          let (start, end) = Self::render_module_debug_info(compilation, &debug_info);
          acc.add(start);
          acc.add(cur_source.clone());
          acc.add(RawSource::from("\n"));
          acc.add(end);
          acc
        },
      )
      .reduce(ConcatSource::default, |mut acc, cur| {
        acc.add(cur);
        acc
      });

    Ok(source)
  }

  fn render_module_debug_info(
    compilation: &Compilation,
    debug_info: &CssModuleDebugInfo,
  ) -> (ConcatSource, ConcatSource) {
    let mut start = ConcatSource::default();
    let mut end = ConcatSource::default();
    let is_dev = compilation.options.mode.is_development();
    if !is_dev {
      return (start, end);
    }

    let context = compilation.options.context.as_str();
    let module = debug_info.module;

    let debug_module_id = module
      .lib_ident(LibIdentOptions { context })
      .unwrap_or("None".into());

    start.add(RawSource::from(format!(
      "/* #region {:?} */\n",
      debug_module_id,
    )));

    start.add(RawSource::from(format!(
      "/*\n- type: {}\n*/\n",
      module.module_type(),
    )));

    end.add(RawSource::from(format!(
      "/* #endregion {debug_module_id:?} */\n\n"
    )));

    (start, end)
  }
}

#[async_trait::async_trait]
impl Plugin for CssPlugin {
  fn name(&self) -> &'static str {
    "css"
  }

  fn apply(
    &self,
    ctx: rspack_core::PluginContext<&mut rspack_core::ApplyContext>,
    _options: &mut CompilerOptions,
  ) -> Result<()> {
    let config = self.config.clone();
    let builder = move || {
      Box::new(CssParserAndGenerator {
        config: config.clone(),
        exports: None,
      }) as Box<dyn ParserAndGenerator>
    };

    ctx
      .context
      .register_parser_and_generator_builder(ModuleType::Css, Box::new(builder.clone()));
    ctx
      .context
      .register_parser_and_generator_builder(ModuleType::CssModule, Box::new(builder.clone()));
    ctx
      .context
      .register_parser_and_generator_builder(ModuleType::CssAuto, Box::new(builder));

    Ok(())
  }

  async fn compilation(
    &self,
    args: CompilationArgs<'_>,
    params: &CompilationParams,
  ) -> PluginCompilationHookOutput {
    args
      .compilation
      .set_dependency_factory(DependencyType::CssUrl, params.normal_module_factory.clone());
    args.compilation.set_dependency_factory(
      DependencyType::CssImport,
      params.normal_module_factory.clone(),
    );
    args.compilation.set_dependency_factory(
      DependencyType::CssCompose,
      params.normal_module_factory.clone(),
    );
    Ok(())
  }

  async fn content_hash(
    &self,
    _ctx: rspack_core::PluginContext,
    args: &rspack_core::ContentHashArgs<'_>,
  ) -> rspack_core::PluginContentHashHookOutput {
    let compilation = &args.compilation;
    let chunk = compilation.chunk_by_ukey.expect_get(&args.chunk_ukey);
    let ordered_modules = Self::get_ordered_chunk_css_modules(
      chunk,
      &compilation.chunk_graph,
      &compilation.module_graph,
      compilation,
    );
    let mut hasher = RspackHash::from(&compilation.options.output);

    ordered_modules
      .iter()
      .map(|m| {
        (
          compilation
            .code_generation_results
            .get_hash(&m.identifier(), Some(&chunk.runtime)),
          compilation.chunk_graph.get_module_id(m.identifier()),
        )
      })
      .for_each(|(current, id)| {
        if let Some(current) = current {
          current.hash(&mut hasher);
          id.hash(&mut hasher);
        }
      });

    Ok(Some((
      SourceType::Css,
      hasher.digest(&compilation.options.output.hash_digest),
    )))
  }

  async fn render_manifest(
    &self,
    _ctx: rspack_core::PluginContext,
    args: rspack_core::RenderManifestArgs<'_>,
  ) -> rspack_core::PluginRenderManifestHookOutput {
    let compilation = args.compilation;
    let chunk = args.chunk_ukey.as_ref(&compilation.chunk_by_ukey);
    if matches!(chunk.kind, ChunkKind::HotUpdate) {
      return Ok(vec![]);
    }

    let ordered_css_modules = Self::get_ordered_chunk_css_modules(
      chunk,
      &compilation.chunk_graph,
      &compilation.module_graph,
      compilation,
    );

    // Prevent generating css files for chunks which don't contain css modules.
    if ordered_css_modules.is_empty() {
      return Ok(Default::default());
    }

    let source = Self::render_chunk_to_source(compilation, chunk, &ordered_css_modules)?;

    let filename_template = get_css_chunk_filename_template(
      chunk,
      &args.compilation.options.output,
      &args.compilation.chunk_group_by_ukey,
    );
    let (output_path, asset_info) = compilation.get_path_with_info(
      filename_template,
      PathData::default()
        .chunk(chunk)
        .content_hash_optional(
          chunk
            .content_hash
            .get(&SourceType::Css)
            .map(|i| i.rendered(compilation.options.output.hash_digest_length)),
        )
        .runtime(&chunk.runtime),
    );

    let content = source.source();
    let auto_public_path_matches: Vec<_> = AUTO_PUBLIC_PATH_PLACEHOLDER_REGEX
      .find_iter(&content)
      .map(|mat| (mat.start(), mat.end()))
      .collect();
    let source = if !auto_public_path_matches.is_empty() {
      let mut replace = ReplaceSource::new(source);
      for (start, end) in auto_public_path_matches {
        let relative = PublicPath::render_auto_public_path(args.compilation, &output_path);
        replace.replace(start as u32, end as u32, &relative, None);
      }
      replace.boxed()
    } else {
      source.boxed()
    };
    Ok(vec![RenderManifestEntry::new(
      source.boxed(),
      output_path,
      asset_info,
      false,
      false,
    )])
  }
}
