/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 450:
/***/ ((module) => {

module.exports = eval("require")("@actions/core");


/***/ }),

/***/ 661:
/***/ ((module) => {

module.exports = eval("require")("aws-sdk");


/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __nccwpck_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		var threw = true;
/******/ 		try {
/******/ 			__webpack_modules__[moduleId](module, module.exports, __nccwpck_require__);
/******/ 			threw = false;
/******/ 		} finally {
/******/ 			if(threw) delete __webpack_module_cache__[moduleId];
/******/ 		}
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat */
/******/ 	
/******/ 	if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = __dirname + "/";/************************************************************************/
var __webpack_exports__ = {};
// This entry need to be wrapped in an IIFE because it need to be isolated against other modules in the chunk.
(() => {
const core = __nccwpck_require__(450)
const AWS = __nccwpck_require__(661)
const cloudfront = new AWS.CloudFront()

function splitArn (arn) {
  const arnParts = arn.split(':')
  const version = arnParts.pop()
  const name = arnParts.join(':')
  return { name, version }
}

const getConfig = async (id) => {
  const params = {
    Id: id
  }
  return await cloudfront.getDistributionConfig(params).promise()
}

function updateBehavior (behavior, lambdaARNDict) {
  if (behavior.LambdaFunctionAssociations.Quantity > 0) {
    behavior.LambdaFunctionAssociations.Items.forEach(assoc => {
      console.info(`Found function: ${assoc.LambdaFunctionARN} for origin: ${behavior.TargetOriginId}`)
      const { name, version } = splitArn(assoc.LambdaFunctionARN)
      if (name in lambdaARNDict && version !== lambdaARNDict[name]) {
        assoc.LambdaFunctionARN = `${name}:${lambdaARNDict[name]}`
        console.info(`Updating function to version: ${lambdaARNDict[name]}`)
      }
    })
  }
}

const updateCloudfront = async (id, tag, distributionConfig, lambdaARNDict) => {
  const updateConfigParams = {
    Id: id,
    IfMatch: tag
  }

  updateConfigParams.DistributionConfig = distributionConfig

  const defaultCacheBehavior = updateConfigParams.DistributionConfig.DefaultCacheBehavior
  updateBehavior(defaultCacheBehavior, lambdaARNDict)

  updateConfigParams.DistributionConfig.CacheBehaviors.Items.forEach(behavior => {
    updateBehavior(behavior, lambdaARNDict)
  })

  return await cloudfront
      .updateDistribution(updateConfigParams)
      .promise()
}

(async () => {
  try {
    const cloudfrontId = core.getInput('cloudfront-id')
    const lambdaARNsString = core.getInput('lambda-arns')
    const lambdaARNs = lambdaARNsString ? lambdaARNsString.split(',') : null
    if (lambdaARNs) {
      console.log(`Function to update: ${lambdaARNs}`)
      
      const lambdaARNDict = {}
      lambdaARNs.forEach((arn) => {
        const { name, version } = splitArn(arn)
        lambdaARNDict[name] = version
      })

      const config = await getConfig(cloudfrontId)
      const distributionConfig = config.DistributionConfig
      const Etag = config.ETag
      await updateCloudfront(cloudfrontId, Etag, distributionConfig, lambdaARNDict)
    } else {
      core.setFailed('No lambda ARNs provided')
    }
  } catch (error) {
    core.setFailed(error.message)
  }
})()

})();

module.exports = __webpack_exports__;
/******/ })()
;