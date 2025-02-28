import * as util from "util";
import path from "path";
import { Compiler, rspack, RspackOptions, Stats } from "../src";
import serializer from "jest-serializer-path";

expect.addSnapshotSerializer(serializer);

const compile = async (options: RspackOptions) => {
	return util.promisify(rspack)(options);
};

describe("Stats", () => {
	it("should have stats", async () => {
		const stats = await compile({
			context: __dirname,
			entry: {
				main: "./fixtures/a"
			}
		});
		const statsOptions = {
			all: true,
			timings: false,
			builtAt: false,
			version: false
		};
		expect(typeof stats?.hash).toBe("string");
		expect(stats?.toJson(statsOptions)).toMatchSnapshot();
		expect(stats?.toString(statsOptions)).toMatchInlineSnapshot(`
		"PublicPath: auto
		asset main.js 211 bytes {main} [emitted] (name: main)
		Entrypoint main 211 bytes = main.js
		chunk {main} main.js (main) [entry]
		  ./fixtures/a.js [585] {main}
		    entry ./fixtures/a
		    cjs self exports reference self [585]
		./fixtures/a.js [585] {main}
		  entry ./fixtures/a
		  cjs self exports reference self [585]
		  
		Rspack compiled successfully (38f6d710192d3067d1eb)"
	`);
	});

	it("should omit all properties with all false", async () => {
		const stats = await compile({
			context: __dirname,
			entry: "./fixtures/a"
		});
		expect(
			stats?.toJson({
				all: false
			})
		).toEqual({});
	});

	it("should look not bad for default stats toString", async () => {
		const stats = await compile({
			context: __dirname,
			entry: "./fixtures/abc"
		});
		expect(stats?.toString({ timings: false, version: false }))
			.toMatchInlineSnapshot(`
		"PublicPath: auto
		asset main.js 758 bytes [emitted] (name: main)
		Entrypoint main 758 bytes = main.js
		./fixtures/a.js
		./fixtures/b.js
		./fixtures/c.js
		./fixtures/abc.js

		ERROR in ./fixtures/b.js ModuleParseError

		  × Module parse failed:
		  ╰─▶   × JavaScript parsing error: Return statement is not allowed here
		         ╭─[4:1]
		       4 │
		       5 │ // Test CJS top-level return
		       6 │ return;
		         · ───────
		         ╰────
		      
		  help: 
		        You may need an appropriate loader to handle this file type.

		Rspack compiled with 1 error (acb0ddfd7b068556fa5f)"
	`);
	});

	it("should output stats with query", async () => {
		const stats = await compile({
			context: __dirname,
			entry: "./fixtures/abc-query"
		});

		const statsOptions = {
			all: true,
			timings: false,
			builtAt: false,
			version: false
		};
		expect(stats?.toJson(statsOptions)).toMatchSnapshot();
	});

	it("should output the specified number of modules when set stats.modulesSpace", async () => {
		const stats = await compile({
			context: __dirname,
			entry: "./fixtures/abc"
		});

		expect(
			stats?.toJson({
				all: true,
				timings: false,
				builtAt: false,
				version: false
			}).modules?.length
		).toBe(4);

		expect(
			stats?.toJson({
				all: true,
				timings: false,
				builtAt: false,
				version: false,
				modulesSpace: 3
			}).modules?.length
			// 2 = 3 - 1 = max - filteredChildrenLineReserved
		).toBe(2);
	});

	it("should have time log when logging verbose", async () => {
		const stats = await compile({
			context: __dirname,
			entry: "./fixtures/abc"
		});
		expect(
			stats
				?.toString({ all: false, logging: "verbose" })
				.replace(/\d+ ms/g, "X ms")
		).toMatchInlineSnapshot(`
		"LOG from rspack.Compilation
		<t> make hook: X ms
		<t> module add task: X ms
		<t> module process dependencies task: X ms
		<t> module factorize task: X ms
		<t> module build task: X ms
		<t> finish modules: X ms
		<t> optimize dependencies: X ms
		<t> optimize dependencies: X ms
		<t> create chunks: X ms
		<t> optimize: X ms
		<t> module ids: X ms
		<t> chunk ids: X ms
		<t> optimize code generation: X ms
		<t> code generation: X ms
		<t> runtime requirements.modules: X ms
		<t> runtime requirements.chunks: X ms
		<t> runtime requirements.entries: X ms
		<t> runtime requirements: X ms
		<t> hashing: hash chunks: X ms
		<t> hashing: hash runtime chunks: X ms
		<t> hashing: process full hash chunks: X ms
		<t> hashing: X ms
		<t> create module assets: X ms
		<t> create chunk assets: X ms
		<t> process assets: X ms

		LOG from rspack.Compiler
		<t> make: X ms
		<t> finish make hook: X ms
		<t> finish compilation: X ms
		<t> seal compilation: X ms
		<t> afterCompile hook: X ms
		<t> emitAssets: X ms
		<t> done hook: X ms

		LOG from rspack.EnsureChunkConditionsPlugin
		<t> ensure chunk conditions: X ms

		LOG from rspack.RealContentHashPlugin
		<t> hash to asset names: X ms

		LOG from rspack.RemoveEmptyChunksPlugin
		<t> remove empty chunks: X ms

		LOG from rspack.SplitChunksPlugin
		<t> prepare module group map: X ms
		<t> ensure min size fit: X ms
		<t> process module group map: X ms
		<t> ensure max size fit: X ms

		LOG from rspack.WarnCaseSensitiveModulesPlugin
		<t> check case sensitive modules: X ms

		LOG from rspack.buildChunkGraph
		<t> prepare entrypoints: X ms
		<t> process queue: X ms
		<t> extend chunkGroup runtime: X ms
		<t> remove parent modules: X ms
		"
	`);
	});

	it("should have module profile when profile is true", async () => {
		const stats = await compile({
			context: __dirname,
			entry: "./fixtures/abc",
			profile: true
		});
		expect(
			stats?.toString({ all: false, modules: true }).replace(/\d+ ms/g, "X ms")
		).toMatchInlineSnapshot(`
		"./fixtures/a.js
		  X ms (resolving: X ms, integration: X ms, building: X ms)
		./fixtures/b.js
		  X ms (resolving: X ms, integration: X ms, building: X ms)
		./fixtures/c.js
		  X ms (resolving: X ms, integration: X ms, building: X ms)
		./fixtures/abc.js
		  X ms (resolving: X ms, integration: X ms, building: X ms)"
	`);
	});

	it("should have cache hits log when logging verbose and cache is enabled", async () => {
		const compiler = rspack({
			context: __dirname,
			entry: "./fixtures/abc",
			cache: true,
			experiments: {
				incrementalRebuild: false
			}
		});
		await new Promise<void>((resolve, reject) => {
			compiler.build(err => {
				if (err) {
					return reject(err);
				}
				resolve();
			});
		});
		const stats = await new Promise<string>((resolve, reject) => {
			compiler.rebuild(
				new Set([path.join(__dirname, "./fixtures/a")]),
				new Set(),
				err => {
					if (err) {
						return reject(err);
					}
					const stats = new Stats(compiler.compilation).toString({
						all: false,
						logging: "verbose"
					});
					resolve(stats);
				}
			);
		});
		expect(stats).toContain("module build cache: 100.0% (4/4)");
		expect(stats).toContain("module factorize cache: 100.0% (7/7)");
		expect(stats).toContain("module code generation cache: 100.0% (4/4)");
	});

	it("should not have any cache hits log when cache is disabled", async () => {
		const compiler = rspack({
			context: __dirname,
			entry: "./fixtures/abc",
			cache: false,
			experiments: {
				incrementalRebuild: false
			}
		});
		await new Promise<void>((resolve, reject) => {
			compiler.build(err => {
				if (err) {
					return reject(err);
				}
				resolve();
			});
		});
		const stats = await new Promise<string>((resolve, reject) => {
			compiler.rebuild(
				new Set([path.join(__dirname, "./fixtures/a")]),
				new Set(),
				err => {
					if (err) {
						return reject(err);
					}
					const stats = new Stats(compiler.compilation).toString({
						all: false,
						logging: "verbose"
					});
					resolve(stats);
				}
			);
		});
		expect(stats).not.toContain("module build cache");
		expect(stats).not.toContain("module factorize cache");
		expect(stats).not.toContain("module code generation cache");
	});

	it("should have any cache hits log of modules in incremental rebuild mode", async () => {
		const compiler = rspack({
			context: __dirname,
			entry: "./fixtures/abc",
			cache: true,
			experiments: {
				incrementalRebuild: true
			}
		});
		await new Promise<void>((resolve, reject) => {
			compiler.build(err => {
				if (err) {
					return reject(err);
				}
				resolve();
			});
		});
		const stats = await new Promise<string>((resolve, reject) => {
			compiler.rebuild(
				new Set([path.join(__dirname, "./fixtures/a")]),
				new Set(),
				err => {
					if (err) {
						return reject(err);
					}
					const stats = new Stats(compiler.compilation).toString({
						all: false,
						logging: "verbose"
					});
					resolve(stats);
				}
			);
		});
		expect(stats).toContain("module build cache: 100.0% (1/1)");
		expect(stats).toContain("module factorize cache: 100.0% (1/1)");
		expect(stats).toContain("module code generation cache: 100.0% (4/4)");
	});

	it("should have ids when ids is true", async () => {
		const stats = await compile({
			context: __dirname,
			entry: "./fixtures/a"
		});
		const options = {
			all: false,
			assets: true,
			modules: true,
			chunks: true,
			ids: true
		};
		expect(stats?.toJson(options)).toMatchSnapshot();
		expect(stats?.toString(options)).toMatchInlineSnapshot(`
		"asset main.js 211 bytes {main} [emitted] (name: main)
		chunk {main} main.js (main) [entry]
		./fixtures/a.js [585] {main}"
	`);
	});

	it("should have null as placeholders in stats before chunkIds", async () => {
		let stats;

		class TestPlugin {
			apply(compiler: Compiler) {
				compiler.hooks.thisCompilation.tap("custom", compilation => {
					compilation.hooks.optimizeModules.tap("test plugin", () => {
						stats = compiler.compilation.getStats().toJson({});
					});
				});
			}
		}
		await compile({
			context: __dirname,
			entry: "./fixtures/a",
			plugins: [new TestPlugin()]
		});

		expect(stats!.entrypoints).toMatchInlineSnapshot(`
		{
		  "main": {
		    "assets": [],
		    "assetsSize": 0,
		    "chunks": [
		      null,
		    ],
		    "name": "main",
		  },
		}
	`);
	});

	it("should have children when using childCompiler", async () => {
		let statsJson;

		class TestPlugin {
			apply(compiler: Compiler) {
				compiler.hooks.thisCompilation.tap(TestPlugin.name, compilation => {
					compilation.hooks.processAssets.tapAsync(
						TestPlugin.name,
						async (assets, callback) => {
							const child = compiler.createChildCompiler(
								compilation,
								"TestChild",
								1,
								compilation.outputOptions,
								[
									new compiler.webpack.EntryPlugin(
										compiler.context,
										"./fixtures/abc",
										{ name: "TestChild" }
									)
								]
							);
							child.runAsChild(err => callback(err));
						}
					);
				});
				compiler.hooks.done.tap("test plugin", stats => {
					statsJson = stats.toJson({
						all: false,
						children: true
					});
				});
			}
		}
		await compile({
			context: __dirname,
			entry: "./fixtures/a",
			plugins: [new TestPlugin()]
		});

		expect(statsJson).toMatchInlineSnapshot(`
		{
		  "children": [
		    {
		      "children": [],
		      "name": "TestChild",
		    },
		  ],
		}
	`);
	});
});
