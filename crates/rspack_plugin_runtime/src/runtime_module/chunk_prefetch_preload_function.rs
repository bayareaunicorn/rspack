use rspack_core::{
  impl_runtime_module,
  rspack_sources::{BoxSource, RawSource, SourceExt},
  Compilation, RuntimeGlobals, RuntimeModule,
};
use rspack_identifier::Identifier;

#[derive(Debug, Eq)]
pub struct ChunkPrefetchPreloadFunctionRuntimeModule {
  id: Identifier,
  runtime_function: RuntimeGlobals,
  runtime_handlers: RuntimeGlobals,
}

impl ChunkPrefetchPreloadFunctionRuntimeModule {
  pub fn new(
    child_type: &str,
    runtime_function: RuntimeGlobals,
    runtime_handlers: RuntimeGlobals,
  ) -> Self {
    Self {
      id: Identifier::from(format!(
        "webpack/runtime/chunk_prefetch_function/{}",
        child_type
      )),
      runtime_function,
      runtime_handlers,
    }
  }
}

impl RuntimeModule for ChunkPrefetchPreloadFunctionRuntimeModule {
  fn name(&self) -> Identifier {
    self.id
  }

  fn generate(&self, _: &Compilation) -> BoxSource {
    RawSource::from(
      include_str!("runtime/chunk_prefetch_preload_function.js")
        .replace("$RUNTIME_FUNCTION$", &self.runtime_function.to_string())
        .replace("$RUNTIME_HANDLERS$", &self.runtime_handlers.to_string()),
    )
    .boxed()
  }
}

impl_runtime_module!(ChunkPrefetchPreloadFunctionRuntimeModule);
