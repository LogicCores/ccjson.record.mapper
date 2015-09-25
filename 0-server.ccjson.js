
exports.forLib = function (LIB) {
    var ccjson = this;

    const CONTEXTS = require("../logic.cores/0-server.boot").boot(LIB);
    
    
    // TODO: Use exporter core as declared in 'contexts' below instead of including module directly here
    const BROWSERIFY = require("../../cores/export/for/browserify/0-server.api").forLib(LIB);


    return LIB.Promise.resolve({
        forConfig: function (defaultConfig) {

            var Entity = function (instanceConfig) {
                var self = this;

                var config = {};
                LIB._.merge(config, defaultConfig);
                LIB._.merge(config, instanceConfig);
                config = ccjson.attachDetachedFunctions(config);

                var context = config.context();

                return context.adapters["data.mapper"].loadCollectionModelsForPath(config.collectionsPath).then(function (models) {

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
                                        options.pointer
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
                        return (seeds = context.adapters["data.mapper"].loadCollectionSeedsForPath(config.collectionsPath));
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
    
                                            var bundle = [];
                                            bundle.push('window.waitForLibrary(function (LIB) {');
                                            bundle.push('    LIB.Collections = {');
                                            Object.keys(api.models).forEach(function (modelAlias, i) {
                                                bundle.push('        ' + (i>0?",":"") + '"' + modelAlias + '": require("' + api.models[modelAlias]._modulePath + '").forLib(LIB)');
                                            });
                                            bundle.push('    };');
                                            bundle.push('});');
    
                                            var apiBundleFile = LIB.path.join(config.collectionsDistPath, "ccjson.record.mapper.js");
                                            return LIB.fs.outputFile(apiBundleFile, bundle.join("\n"), "utf8", function (err) {
                                                if (err) return next(err);
    
                        						return BROWSERIFY.bundleFiles(
                        							LIB.path.dirname(apiBundleFile),
                        							[
                        								LIB.path.basename(apiBundleFile)
                        							],
                        							LIB.path.join(apiBundleFile, "..", "ccjson.record.mapper.dist.js")
                        						).then(function (bundle) {
                        							res.writeHead(200, {
                        								"Content-Type": "application/javascript"
                        							});
                        							return res.end(bundle);
                        						}).catch(next);
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
