const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { ValidationService } = require('../services/validationService');
const { CodeValidator } = require('../validators/codeValidator');
const { IntegrationValidator } = require('../validators/integrationValidator');
const { BlockchainValidator } = require('../validators/blockchainValidator');
const { ApiValidator } = require('../validators/apiValidator');
const { DeploymentValidator } = require('../validators/deploymentValidator');
const { logger } = require('../utils/logger');

const router = express.Router();
const validationService = new ValidationService();

/**
 * @swagger
 * /api/validation/code:
 *   post:
 *     summary: Validate code quality and standards
 *     tags: [Validation]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               projectPath:
 *                 type: string
 *                 description: Path to the project directory
 *               rules:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Validation rules to apply
 *               options:
 *                 type: object
 *                 properties:
 *                   strict:
 *                     type: boolean
 *                     description: Enable strict validation
 *                   includeTests:
 *                     type: boolean
 *                     description: Include test files in validation
 *                   languages:
 *                     type: array
 *                     items:
 *                       type: string
 *                     description: Programming languages to validate
 *     responses:
 *       200:
 *         description: Code validation completed
 *       400:
 *         description: Invalid input
 */
router.post('/code', [
  body('projectPath')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Project path is required'),
  body('rules')
    .optional()
    .isArray()
    .withMessage('Rules must be an array'),
  body('options.strict')
    .optional()
    .isBoolean()
    .withMessage('Strict option must be boolean'),
  body('options.includeTests')
    .optional()
    .isBoolean()
    .withMessage('IncludeTests option must be boolean'),
  body('options.languages')
    .optional()
    .isArray()
    .withMessage('Languages must be an array')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array()
        }
      });
    }

    const { projectPath, rules = [], options = {} } = req.body;
    const userId = req.user.id;

    logger.info(`Validating code for user ${userId}`, { projectPath, rules, options });

    const codeValidator = new CodeValidator();
    const validation = await codeValidator.validate(projectPath, rules, options);

    res.json({
      success: true,
      data: validation,
      message: 'Code validation completed'
    });

  } catch (error) {
    logger.error('Code validation failed:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/validation/integration:
 *   post:
 *     summary: Validate integration configurations
 *     tags: [Validation]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               integrations:
 *                 type: array
 *                 items:
 *                   type: object
 *                 description: Integration configurations to validate
 *               options:
 *                 type: object
 *                 properties:
 *                   checkConnectivity:
 *                     type: boolean
 *                     description: Test actual connectivity
 *                   validateCredentials:
 *                     type: boolean
 *                     description: Validate credentials
 *     responses:
 *       200:
 *         description: Integration validation completed
 */
router.post('/integration', [
  body('integrations')
    .isArray()
    .withMessage('Integrations must be an array'),
  body('options.checkConnectivity')
    .optional()
    .isBoolean()
    .withMessage('CheckConnectivity option must be boolean'),
  body('options.validateCredentials')
    .optional()
    .isBoolean()
    .withMessage('ValidateCredentials option must be boolean')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array()
        }
      });
    }

    const { integrations, options = {} } = req.body;
    const userId = req.user.id;

    logger.info(`Validating integrations for user ${userId}`, { 
      integrationCount: integrations.length, 
      options 
    });

    const integrationValidator = new IntegrationValidator();
    const validation = await integrationValidator.validate(integrations, options);

    res.json({
      success: true,
      data: validation,
      message: 'Integration validation completed'
    });

  } catch (error) {
    logger.error('Integration validation failed:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/validation/blockchain:
 *   post:
 *     summary: Validate blockchain configurations
 *     tags: [Validation]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               contracts:
 *                 type: array
 *                 items:
 *                   type: object
 *                 description: Smart contracts to validate
 *               network:
 *                 type: string
 *                 description: Blockchain network configuration
 *               options:
 *                 type: object
 *                 properties:
 *                   testnet:
 *                     type: boolean
 *                     description: Use testnet for validation
 *                   gasEstimation:
 *                     type: boolean
 *                     description: Include gas estimation
 *                   securityCheck:
 *                     type: boolean
 *                     description: Perform security checks
 *     responses:
 *       200:
 *         description: Blockchain validation completed
 */
router.post('/blockchain', [
  body('contracts')
    .isArray()
    .withMessage('Contracts must be an array'),
  body('network')
    .isString()
    .withMessage('Network must be a string'),
  body('options.testnet')
    .optional()
    .isBoolean()
    .withMessage('Testnet option must be boolean'),
  body('options.gasEstimation')
    .optional()
    .isBoolean()
    .withMessage('GasEstimation option must be boolean'),
  body('options.securityCheck')
    .optional()
    .isBoolean()
    .withMessage('SecurityCheck option must be boolean')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array()
        }
      });
    }

    const { contracts, network, options = {} } = req.body;
    const userId = req.user.id;

    logger.info(`Validating blockchain for user ${userId}`, { 
      contractCount: contracts.length, 
      network, 
      options 
    });

    const blockchainValidator = new BlockchainValidator();
    const validation = await blockchainValidator.validate(contracts, network, options);

    res.json({
      success: true,
      data: validation,
      message: 'Blockchain validation completed'
    });

  } catch (error) {
    logger.error('Blockchain validation failed:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/validation/api:
 *   post:
 *     summary: Validate API configurations
 *     tags: [Validation]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               apiSpecs:
 *                 type: array
 *                 items:
 *                   type: object
 *                 description: API specifications to validate
 *               options:
 *                 type: object
 *                 properties:
 *                   testEndpoints:
 *                     type: boolean
 *                     description: Test actual API endpoints
 *                   validateSchema:
 *                     type: boolean
 *                     description: Validate API schema
 *                   checkSecurity:
 *                     type: boolean
 *                     description: Check security configurations
 *     responses:
 *       200:
 *         description: API validation completed
 */
router.post('/api', [
  body('apiSpecs')
    .isArray()
    .withMessage('API specs must be an array'),
  body('options.testEndpoints')
    .optional()
    .isBoolean()
    .withMessage('TestEndpoints option must be boolean'),
  body('options.validateSchema')
    .optional()
    .isBoolean()
    .withMessage('ValidateSchema option must be boolean'),
  body('options.checkSecurity')
    .optional()
    .isBoolean()
    .withMessage('CheckSecurity option must be boolean')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array()
        }
      });
    }

    const { apiSpecs, options = {} } = req.body;
    const userId = req.user.id;

    logger.info(`Validating API for user ${userId}`, { 
      specCount: apiSpecs.length, 
      options 
    });

    const apiValidator = new ApiValidator();
    const validation = await apiValidator.validate(apiSpecs, options);

    res.json({
      success: true,
      data: validation,
      message: 'API validation completed'
    });

  } catch (error) {
    logger.error('API validation failed:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/validation/deployment:
 *   post:
 *     summary: Validate deployment configurations
 *     tags: [Validation]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               deploymentConfig:
 *                 type: object
 *                 description: Deployment configuration to validate
 *               environment:
 *                 type: string
 *                 enum: [development, staging, production]
 *                 description: Target environment
 *               options:
 *                 type: object
 *                 properties:
 *                   checkResources:
 *                     type: boolean
 *                     description: Check resource availability
 *                   validateSecrets:
 *                     type: boolean
 *                     description: Validate secrets and credentials
 *                   testConnectivity:
 *                     type: boolean
 *                     description: Test connectivity to services
 *     responses:
 *       200:
 *         description: Deployment validation completed
 */
router.post('/deployment', [
  body('deploymentConfig')
    .isObject()
    .withMessage('Deployment config must be an object'),
  body('environment')
    .isIn(['development', 'staging', 'production'])
    .withMessage('Invalid environment'),
  body('options.checkResources')
    .optional()
    .isBoolean()
    .withMessage('CheckResources option must be boolean'),
  body('options.validateSecrets')
    .optional()
    .isBoolean()
    .withMessage('ValidateSecrets option must be boolean'),
  body('options.testConnectivity')
    .optional()
    .isBoolean()
    .withMessage('TestConnectivity option must be boolean')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array()
        }
      });
    }

    const { deploymentConfig, environment, options = {} } = req.body;
    const userId = req.user.id;

    logger.info(`Validating deployment for user ${userId}`, { 
      environment, 
      options 
    });

    const deploymentValidator = new DeploymentValidator();
    const validation = await deploymentValidator.validate(
      deploymentConfig, 
      environment, 
      options
    );

    res.json({
      success: true,
      data: validation,
      message: 'Deployment validation completed'
    });

  } catch (error) {
    logger.error('Deployment validation failed:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/validation/complete:
 *   post:
 *     summary: Run complete validation suite
 *     tags: [Validation]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               projectPath:
 *                 type: string
 *                 description: Path to the project directory
 *               validationTypes:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [code, integration, blockchain, api, deployment]
 *                 description: Types of validation to run
 *               options:
 *                 type: object
 *                 properties:
 *                   parallel:
 *                     type: boolean
 *                     description: Run validations in parallel
 *                   stopOnError:
 *                     type: boolean
 *                     description: Stop on first error
 *                   generateReport:
 *                     type: boolean
 *                     description: Generate validation report
 *     responses:
 *       200:
 *         description: Complete validation completed
 */
router.post('/complete', [
  body('projectPath')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Project path is required'),
  body('validationTypes')
    .isArray()
    .withMessage('Validation types must be an array'),
  body('validationTypes.*')
    .isIn(['code', 'integration', 'blockchain', 'api', 'deployment'])
    .withMessage('Invalid validation type'),
  body('options.parallel')
    .optional()
    .isBoolean()
    .withMessage('Parallel option must be boolean'),
  body('options.stopOnError')
    .optional()
    .isBoolean()
    .withMessage('StopOnError option must be boolean'),
  body('options.generateReport')
    .optional()
    .isBoolean()
    .withMessage('GenerateReport option must be boolean')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array()
        }
      });
    }

    const { projectPath, validationTypes, options = {} } = req.body;
    const userId = req.user.id;

    logger.info(`Running complete validation for user ${userId}`, { 
      projectPath, 
      validationTypes, 
      options 
    });

    const validation = await validationService.runCompleteValidation(
      projectPath, 
      validationTypes, 
      options
    );

    res.json({
      success: true,
      data: validation,
      message: 'Complete validation completed'
    });

  } catch (error) {
    logger.error('Complete validation failed:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/validation/rules:
 *   get:
 *     summary: Get available validation rules
 *     tags: [Validation]
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [code, integration, blockchain, api, deployment]
 *         description: Filter by validation type
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by category
 *     responses:
 *       200:
 *         description: Validation rules retrieved successfully
 */
router.get('/rules', [
  query('type')
    .optional()
    .isIn(['code', 'integration', 'blockchain', 'api', 'deployment'])
    .withMessage('Invalid validation type'),
  query('category')
    .optional()
    .isString()
    .withMessage('Category must be a string')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array()
        }
      });
    }

    const { type, category } = req.query;

    const rules = await validationService.getValidationRules({ type, category });

    res.json({
      success: true,
      data: rules,
      message: 'Validation rules retrieved successfully'
    });

  } catch (error) {
    logger.error('Failed to get validation rules:', error);
    next(error);
  }
});

module.exports = router;