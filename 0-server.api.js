
exports.forLib = function (LIB) {

    var exports = {};

    exports.spin = function (context) {

        var exports = {};

        exports.loadCollectionModelsForPath = function (sets) {
            var models = {};
            return LIB.Promise.all(Object.keys(sets).map(function (alias) {
                // See if we have a loader
                if (/\.js$/.test(sets[alias])) {

                    var collectionLoaderModule = require(sets[alias]);
                    var collectionLoaderFactory = collectionLoaderModule.forLib(LIB);
                    
                    var ctx = LIB._.assign({}, context);
                    LIB._.assign(ctx, {
                        collectionPrefix: (alias && (alias + ".")) || ""
                    });
                    var collectionControls = collectionLoaderFactory.spin(ctx);

                    return LIB.Promise.all(Object.keys(collectionControls.configPaths).map(function (name) {

                        return LIB.fs.readFileAsync(
                            LIB.path.join(sets[alias], "..", collectionControls.configPaths[name]),
                            "utf8"
                        ).then(function (configFileContent) {
                            var model = collectionControls.makeCollection(name, JSON.parse(configFileContent));
                            models[model.name] = model;
                        });
                    }));

                } else
                // Or should be loading by scanning files
                {
                    return LIB.Promise.promisify(function (callback) {
                        return LIB.glob("**/*.model.js", {
                            cwd: sets[alias]
                        }, function (err, files) {
                            if (err) return callback(err);
                            files.forEach(function (path) {
                                var collectionModule = require(
                                    LIB.path.join(sets[alias], path)
                                );
                                var collectionFactory = collectionModule.forLib(LIB);
                                var collectionModelInstance = collectionFactory.spin(context);
                                models[collectionModelInstance.name] = collectionModelInstance;
                            });
                            return callback(null);
                        });
                    })();
                }
            })).then(function () {
                return models;
            });
        }

        exports.loadCollectionSeedsForPath = function (sets) {
            var seeds = {};
            return LIB.Promise.all(Object.keys(sets).map(function (alias) {
                // See if we have a loader
                if (/\.js$/.test(sets[alias])) {

console.log("TODO: LOAD CLLECTION SEEDS USING LOADER!!!", sets[alias]);

                    
                } else
                // Or should be loading by scanning files
                {
                    return LIB.Promise.promisify(function (callback) {
                        return LIB.glob("**/*.seed.js", {
                            cwd: sets[alias]
                        }, function (err, files) {
                            if (err) return callback(err);
                            files.forEach(function (path) {
                                var collectionModule = require(
                                    LIB.path.join(sets[alias], path)
                                );
                                var collectionFactory = collectionModule.forLib(LIB);
                                var collectionSeedInstance = collectionFactory.spin(context);
                                seeds[collectionSeedInstance.name] = collectionSeedInstance;
                            });
                            return callback(null);
                        });
                    })();
                }
            })).then(function () {
                return seeds;
            });
        }

        return exports;
    }

    return exports;
}
