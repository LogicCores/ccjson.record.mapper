
exports.forLib = function (LIB) {

    var exports = {};

    exports.spin = function (context) {

        var exports = {};

        exports.loadCollectionModelsForPath = function (basePath) {
            return LIB.Promise.promisify(function (callback) {
                return LIB.glob("**/*.model.js", {
                    cwd: basePath
                }, function (err, files) {
                    if (err) return callback(err);
                    var models = {};
                    files.forEach(function (path) {
                        var collectionModule = require(
                            LIB.path.join(basePath, path)
                        );
                        var collectionFactory = collectionModule.forLib(LIB);
                        var collectionModelInstance = collectionFactory.spin(context);
                        models[collectionModelInstance.name] = collectionModelInstance;
                    });
                    return callback(null, models);
                });
            })();
        }

        exports.loadCollectionSeedsForPath = function (basePath) {
            return LIB.Promise.promisify(function (callback) {
                return LIB.glob("**/*.seed.js", {
                    cwd: basePath
                }, function (err, files) {
                    if (err) return callback(err);
                    var seeds = {};
                    files.forEach(function (path) {
                        var collectionModule = require(
                            LIB.path.join(basePath, path)
                        );
                        var collectionFactory = collectionModule.forLib(LIB);
                        var collectionSeedInstance = collectionFactory.spin(context);
                        seeds[collectionSeedInstance.name] = collectionSeedInstance;
                    });
                    return callback(null, seeds);
                });
            })();
        }

        return exports;
    }

    return exports;
}
