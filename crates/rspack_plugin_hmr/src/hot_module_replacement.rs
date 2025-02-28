use rspack_core::{
  impl_runtime_module,
  rspack_sources::{BoxSource, RawSource, SourceExt},
  Compilation, RuntimeModule,
};
use rspack_identifier::Identifier;

#[derive(Debug, Eq)]
pub struct HotModuleReplacementRuntimeModule {
  id: Identifier,
}

impl Default for HotModuleReplacementRuntimeModule {
  fn default() -> Self {
    Self {
      id: Identifier::from("webpack/runtime/hot_module_replacement"),
    }
  }
}

impl RuntimeModule for HotModuleReplacementRuntimeModule {
  fn name(&self) -> Identifier {
    self.id
  }

  fn generate(&self, _compilation: &Compilation) -> BoxSource {
    RawSource::from(include_str!("runtime/hot_module_replacement.js")).boxed()
  }
}

impl_runtime_module!(HotModuleReplacementRuntimeModule);
