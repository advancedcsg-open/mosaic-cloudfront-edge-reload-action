const core = require('@actions/core')
const AWS = require('aws-sdk')
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

const updateEdgeFunctions = async (cloudfrontId, lambdaARNDict) => {
  const config = await getConfig(cloudfrontId)
  const distributionConfig = config.DistributionConfig
  const Etag = config.ETag
  await updateCloudfront(cloudfrontId, Etag, distributionConfig, lambdaARNDict)
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

      try {
        await updateEdgeFunctions(cloudfrontId, lambdaARNDict)
      } catch (error) {
        console.error('Failed to update Edge functions, retrying...')
        await updateEdgeFunctions(cloudfrontId, lambdaARNDict)
      }
    } else {
      core.setFailed('No lambda ARNs provided')
    }
  } catch (error) {
    core.setFailed(error.message)
  }
})()
