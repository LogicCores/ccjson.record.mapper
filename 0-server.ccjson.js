
exports.forLib = function (LIB) {
    var ccjson = this;

    const CONTEXTS = require("../logic.cores/0-server.boot").boot(LIB);


    return LIB.Promise.resolve({
        forConfig: function (defaultConfig) {

            var Entity = function (instanceConfig) {
                var self = this;

                var config = {};
                LIB._.merge(config, defaultConfig);
                LIB._.merge(config, instanceConfig);
                config = ccjson.attachDetachedFunctions(config);

                var context = config.context();

                return context.adapters["data.mapper"].loadCollectionModelsForPath(
                    config.collectionsPath || config.collectionsPaths
                ).then(function (models) {

                    var Producer = function () {
                        var self = this;
                        
                        var context = null;
                        var producer = null;

                        self.setDataContext = function (_context) {
                            context = _context;
                        }
                        self.setDataProducer = function (_producer) {
                            producer = _producer;
                        }

                        self.app = function (options) {
                            return function (req, res, next) {
                                return LIB.Promise.try(function () {
                                    return producer(
                                        options.context,
                                        options.pointer,
                                        req.query || {}
                                    );
                                }).then(function (result) {
                                    res.writeHead(200, {
                                        "Content-Type": "application/json"
                                    });
                                    res.end(JSON.stringify(result, null, 4));
                                    return;
                                }).catch(next);
                            };
                        }
                    }

                    var seeds = null;
                    function getSeeds () {
                        if (seeds) return seeds;
                        return (seeds = context.adapters["data.mapper"].loadCollectionSeedsForPath(
                            config.collectionsPath || config.collectionsPaths
                        ));
                    }

                    // POLICY: This is the PUBLIC CONTEXT API accessible to all cores attatched to
                    //         the same parent context that this core is a member of. This API is for reflection
                    //         and verbose context coordination purposes and the surface is only available
                    //         during development. Any sensitive data connections or connections that MUST
                    //         survive in production must be DECLARED in ccjson files! 
                    //         This policy is currently ADVISORY as the API surface is currently available
                    //         in production as there is no optimized secure runtime yet. This is just a matter of time.
                    var api = {
                        // TODO: Declare in ccjson by mapping '"#contract: "ccjson.record.mapper/Producer"' into any using cores.
                        Producer: Producer,
                        // TODO: Remove this and use aspect instance declaration function below.
                        models: models,
                        // TODO: Remove this and use aspect instance declaration function below.
                        getSeeds: function () {
                            return getSeeds();
                        }
                    };

                    context.setAdapterAPI(api);


                    self.AspectInstance = function (aspectConfig) {
    
                        var config = {};
                        LIB._.merge(config, defaultConfig);
                        LIB._.merge(config, instanceConfig);
                        LIB._.merge(config, aspectConfig);
                        config = ccjson.attachDetachedFunctions(config);
    
    // HACK: Remove this when we can declare variable in root config.
if (process.env.ENVIRONMENT_TYPE === "production") {
config.alwaysRebuild = false;
}

                        return LIB.Promise.resolve({
                            collections: function () {
                                return LIB.Promise.resolve(
                                    ccjson.makeDetachedFunction(
                                        function () {
                                            var collections = {};
                                            for (var name in models) {
                                                if (
                                                    models[name]["#contracts"] &&
                                                    models[name]["#contracts"][config["#contract"]]
                                                ) {
                                                    collections[name] = models[name];
                                                }
                                            }
                                            return LIB.Promise.resolve(collections);
                                        }
                                    )
                                );
                            },
                            seeds: function () {
                                return LIB.Promise.resolve(
                                    ccjson.makeDetachedFunction(
                                        function () {
                                            // We don't load the seeds until requested for the first time.
                                            return getSeeds().then(function (seeds) {
                                                var collections = {};
                                                for (var name in seeds) {
                                                    if (
                                                        seeds[name]["#contracts"] &&
                                                        seeds[name]["#contracts"][config["#contract"]]
                                                    ) {
                                                        collections[name] = seeds[name];
                                                    }
                                                }
                                                return collections;
                                            });
                                        }
                                    )
                                );
                            },
                            collectionsApiBundleApp: function () {
                                return LIB.Promise.resolve(
                                    ccjson.makeDetachedFunction(
                                        function (req, res, next) {

                                            var apiBundleFile = LIB.path.join(config.collectionsDistPath, "ccjson.record.mapper.js");
                                            var distPath = LIB.path.join(apiBundleFile, "..", "ccjson.record.mapper.dist.js");

                                            return LIB.fs.exists(distPath, function (exists) {
                                
                                		        if (
                                		        	exists &&
                                		        	(
                                		        		config.alwaysRebuild === false
                                		        	)
                                		        ) {
                                		           	// We return a pre-built file if it exists and are being asked for it
                                					res.writeHead(200, {
                                						"Content-Type": "application/javascript"
                                					});

                                		           	return LIB.fs.createReadStream(distPath).pipe(res);
                                	
                                		        } else {
    
                                                    var bundle = [];
                                                    bundle.push('window.waitForLibrary(function (LIB) {');
                                                    
                                                    bundle.push('    LIB.Collections = {');
                                                    Object.keys(api.models).filter(function (modelAlias) {
                                                        return api.models[modelAlias]._modulePath;
                                                    }).forEach(function (modelAlias, i) {
                                                        bundle.push('        ' + (i>0?",":"") + '"' + modelAlias + '": require("' + api.models[modelAlias]._modulePath + '").forLib(LIB)');
                                                    });
                                                    bundle.push('    };');
                                                    
                                                    var CollectionLoaders = {};
                                                    Object.keys(api.models).filter(function (modelAlias) {
                                                        return api.models[modelAlias]._moduleConfig;
                                                    }).forEach(function (modelAlias, i) {
                                                        // NOTE: We assume the prefix is the same for all collections in this loader.
                                                        if (!CollectionLoaders[api.models[modelAlias]._moduleLoaderPath]) {
                                                            CollectionLoaders[api.models[modelAlias]._moduleLoaderPath] = {
                                                                prefix: api.models[modelAlias]._modulePrefix,
                                                                collections: {}
                                                            };
                                                        }
                                                        CollectionLoaders[api.models[modelAlias]._moduleLoaderPath].collections[
                                                            modelAlias.substring(api.models[modelAlias]._modulePrefix.length)
                                                        ] = api.models[modelAlias]._moduleConfig;
                                                    });
                                                    
                                                    bundle.push('    LIB.CollectionLoaders = [');
                                                    Object.keys(CollectionLoaders).forEach(function (loaderPath) {
                                                        bundle.push('        function spin(context) {');
                                                        bundle.push('            var ctx = LIB._.assign({}, context);');
                                                        if (CollectionLoaders[loaderPath].prefix) {
                                                            bundle.push('            LIB._.assign(ctx, {"collectionPrefix": "' + CollectionLoaders[loaderPath].prefix + '"});');
                                                        }
                                                        bundle.push('            var collectionControls = require("' + loaderPath + '").forLib(LIB).spin(ctx);');
                                                        Object.keys(CollectionLoaders[loaderPath].collections).forEach(function (modelAlias) {
                                                            bundle.push('            collectionControls.makeCollection("' + modelAlias + '", ' + JSON.stringify(
                                                                CollectionLoaders[loaderPath].collections[modelAlias]
                                                            ) + ');');
                                                        });
                                                        bundle.push('        }');
                                                    });
                                                    bundle.push('    ];');

                                                    bundle.push('});');
            
                                                    return LIB.fs.outputFile(apiBundleFile, bundle.join("\n"), "utf8", function (err) {
                                                        if (err) return next(err);
            
                                                        // TODO: Use exporter core as declared in 'contexts' below instead of including module directly here
                                                        const BROWSERIFY = require("../../cores/export/for/browserify/0-server.api").forLib(LIB);

                                						return BROWSERIFY.bundleFiles(
                                							LIB.path.dirname(apiBundleFile),
                                							[
                                								LIB.path.basename(apiBundleFile)
                                							],
                                							distPath
                                						).then(function (bundle) {
                                							res.writeHead(200, {
                                								"Content-Type": "application/javascript"
                                							});
                                							return res.end(bundle);
                                						}).catch(next);
                                                    });
                                		        }
                                            });
                                        }
                                    )
                                );
                            }
                        });
                    }
                }).then(function () {
                    return self;
                });
            }
            Entity.prototype.config = defaultConfig;

            return Entity;
        }
    });
}
