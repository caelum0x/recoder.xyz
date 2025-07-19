const AWS = require('aws-sdk');
const { logger } = require('../../utils/logger');

class AWSIntegration {
  constructor(options = {}) {
    this.accessKeyId = options.accessKeyId || process.env.AWS_ACCESS_KEY_ID;
    this.secretAccessKey = options.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY;
    this.region = options.region || process.env.AWS_REGION || 'us-east-1';
    this.timeout = options.timeout || 30000;
    
    if (!this.accessKeyId || !this.secretAccessKey) {
      throw new Error('AWS credentials are required');
    }
    
    AWS.config.update({
      accessKeyId: this.accessKeyId,
      secretAccessKey: this.secretAccessKey,
      region: this.region,
      timeout: this.timeout
    });

    // Initialize AWS services
    this.ec2 = new AWS.EC2();
    this.s3 = new AWS.S3();
    this.lambda = new AWS.Lambda();
    this.rds = new AWS.RDS();
    this.cloudFormation = new AWS.CloudFormation();
    this.iam = new AWS.IAM();
    this.vpc = new AWS.EC2(); // VPC operations use EC2 client
    this.ecs = new AWS.ECS();
    this.eks = new AWS.EKS();
    this.elasticBeanstalk = new AWS.ElasticBeanstalk();
    this.route53 = new AWS.Route53();
    this.cloudWatch = new AWS.CloudWatch();
    this.sns = new AWS.SNS();
    this.sqs = new AWS.SQS();
  }

  // EC2 Operations
  async createEC2Instance(options) {
    const { 
      imageId = 'ami-0c02fb55956c7d316', // Amazon Linux 2
      instanceType = 't2.micro',
      keyName,
      securityGroupIds = [],
      subnetId,
      userData,
      tags = []
    } = options;

    try {
      const params = {
        ImageId: imageId,
        InstanceType: instanceType,
        MinCount: 1,
        MaxCount: 1,
        KeyName: keyName,
        SecurityGroupIds: securityGroupIds,
        SubnetId: subnetId,
        UserData: userData ? Buffer.from(userData).toString('base64') : undefined,
        TagSpecifications: tags.length > 0 ? [{
          ResourceType: 'instance',
          Tags: tags
        }] : undefined
      };

      const result = await this.ec2.runInstances(params).promise();
      const instance = result.Instances[0];

      return {
        success: true,
        instance: {
          instanceId: instance.InstanceId,
          state: instance.State.Name,
          instanceType: instance.InstanceType,
          imageId: instance.ImageId,
          launchTime: instance.LaunchTime
        }
      };
    } catch (error) {
      logger.error('Failed to create EC2 instance:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async listEC2Instances() {
    try {
      const result = await this.ec2.describeInstances().promise();
      const instances = [];

      result.Reservations.forEach(reservation => {
        reservation.Instances.forEach(instance => {
          instances.push({
            instanceId: instance.InstanceId,
            state: instance.State.Name,
            instanceType: instance.InstanceType,
            publicIpAddress: instance.PublicIpAddress,
            privateIpAddress: instance.PrivateIpAddress,
            launchTime: instance.LaunchTime
          });
        });
      });

      return {
        success: true,
        instances: instances
      };
    } catch (error) {
      logger.error('Failed to list EC2 instances:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async terminateEC2Instance(instanceId) {
    try {
      await this.ec2.terminateInstances({
        InstanceIds: [instanceId]
      }).promise();

      return {
        success: true,
        instanceId: instanceId,
        action: 'terminated'
      };
    } catch (error) {
      logger.error('Failed to terminate EC2 instance:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // S3 Operations
  async createS3Bucket(options) {
    const { bucketName, region = this.region, acl = 'private' } = options;

    try {
      const params = {
        Bucket: bucketName,
        ACL: acl
      };

      if (region !== 'us-east-1') {
        params.CreateBucketConfiguration = {
          LocationConstraint: region
        };
      }

      await this.s3.createBucket(params).promise();

      return {
        success: true,
        bucket: {
          name: bucketName,
          region: region
        }
      };
    } catch (error) {
      logger.error('Failed to create S3 bucket:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async uploadToS3(options) {
    const { bucketName, key, body, contentType, metadata = {} } = options;

    try {
      const params = {
        Bucket: bucketName,
        Key: key,
        Body: body,
        ContentType: contentType,
        Metadata: metadata
      };

      const result = await this.s3.upload(params).promise();

      return {
        success: true,
        upload: {
          location: result.Location,
          bucket: result.Bucket,
          key: result.Key,
          etag: result.ETag
        }
      };
    } catch (error) {
      logger.error('Failed to upload to S3:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async downloadFromS3(options) {
    const { bucketName, key } = options;

    try {
      const params = {
        Bucket: bucketName,
        Key: key
      };

      const result = await this.s3.getObject(params).promise();

      return {
        success: true,
        object: {
          body: result.Body,
          contentType: result.ContentType,
          lastModified: result.LastModified,
          contentLength: result.ContentLength
        }
      };
    } catch (error) {
      logger.error('Failed to download from S3:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Lambda Operations
  async createLambdaFunction(options) {
    const { 
      functionName, 
      runtime = 'nodejs18.x',
      handler = 'index.handler',
      code,
      role,
      description,
      timeout = 30,
      memorySize = 128,
      environment = {}
    } = options;

    try {
      const params = {
        FunctionName: functionName,
        Runtime: runtime,
        Role: role,
        Handler: handler,
        Code: code,
        Description: description,
        Timeout: timeout,
        MemorySize: memorySize,
        Environment: {
          Variables: environment
        }
      };

      const result = await this.lambda.createFunction(params).promise();

      return {
        success: true,
        function: {
          functionName: result.FunctionName,
          functionArn: result.FunctionArn,
          runtime: result.Runtime,
          handler: result.Handler,
          codeSize: result.CodeSize,
          timeout: result.Timeout,
          memorySize: result.MemorySize
        }
      };
    } catch (error) {
      logger.error('Failed to create Lambda function:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async invokeLambdaFunction(options) {
    const { functionName, payload = {}, invocationType = 'RequestResponse' } = options;

    try {
      const params = {
        FunctionName: functionName,
        InvocationType: invocationType,
        Payload: JSON.stringify(payload)
      };

      const result = await this.lambda.invoke(params).promise();

      return {
        success: true,
        invocation: {
          statusCode: result.StatusCode,
          payload: result.Payload ? JSON.parse(result.Payload) : null,
          executedVersion: result.ExecutedVersion
        }
      };
    } catch (error) {
      logger.error('Failed to invoke Lambda function:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // RDS Operations
  async createRDSInstance(options) {
    const { 
      dbInstanceIdentifier,
      dbInstanceClass = 'db.t3.micro',
      engine = 'mysql',
      masterUsername,
      masterUserPassword,
      allocatedStorage = 20,
      dbName,
      vpcSecurityGroupIds = [],
      dbSubnetGroupName
    } = options;

    try {
      const params = {
        DBInstanceIdentifier: dbInstanceIdentifier,
        DBInstanceClass: dbInstanceClass,
        Engine: engine,
        MasterUsername: masterUsername,
        MasterUserPassword: masterUserPassword,
        AllocatedStorage: allocatedStorage,
        DBName: dbName,
        VpcSecurityGroupIds: vpcSecurityGroupIds,
        DBSubnetGroupName: dbSubnetGroupName
      };

      const result = await this.rds.createDBInstance(params).promise();

      return {
        success: true,
        database: {
          dbInstanceIdentifier: result.DBInstance.DBInstanceIdentifier,
          dbInstanceStatus: result.DBInstance.DBInstanceStatus,
          engine: result.DBInstance.Engine,
          dbInstanceClass: result.DBInstance.DBInstanceClass,
          endpoint: result.DBInstance.Endpoint
        }
      };
    } catch (error) {
      logger.error('Failed to create RDS instance:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // VPC Operations
  async createVPC(options) {
    const { cidrBlock = '10.0.0.0/16', tags = [] } = options;

    try {
      const vpcResult = await this.vpc.createVpc({
        CidrBlock: cidrBlock,
        TagSpecifications: tags.length > 0 ? [{
          ResourceType: 'vpc',
          Tags: tags
        }] : undefined
      }).promise();

      const vpcId = vpcResult.Vpc.VpcId;

      // Create Internet Gateway
      const igwResult = await this.vpc.createInternetGateway().promise();
      const igwId = igwResult.InternetGateway.InternetGatewayId;

      // Attach Internet Gateway to VPC
      await this.vpc.attachInternetGateway({
        InternetGatewayId: igwId,
        VpcId: vpcId
      }).promise();

      return {
        success: true,
        vpc: {
          vpcId: vpcId,
          cidrBlock: vpcResult.Vpc.CidrBlock,
          state: vpcResult.Vpc.State,
          internetGatewayId: igwId
        }
      };
    } catch (error) {
      logger.error('Failed to create VPC:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async createSubnet(options) {
    const { vpcId, cidrBlock, availabilityZone, tags = [] } = options;

    try {
      const result = await this.vpc.createSubnet({
        VpcId: vpcId,
        CidrBlock: cidrBlock,
        AvailabilityZone: availabilityZone,
        TagSpecifications: tags.length > 0 ? [{
          ResourceType: 'subnet',
          Tags: tags
        }] : undefined
      }).promise();

      return {
        success: true,
        subnet: {
          subnetId: result.Subnet.SubnetId,
          vpcId: result.Subnet.VpcId,
          cidrBlock: result.Subnet.CidrBlock,
          availabilityZone: result.Subnet.AvailabilityZone,
          state: result.Subnet.State
        }
      };
    } catch (error) {
      logger.error('Failed to create subnet:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // CloudFormation Operations
  async deployCloudFormationStack(options) {
    const { 
      stackName, 
      templateBody, 
      templateUrl,
      parameters = [],
      capabilities = ['CAPABILITY_IAM'],
      tags = []
    } = options;

    try {
      const params = {
        StackName: stackName,
        Parameters: parameters,
        Capabilities: capabilities,
        Tags: tags
      };

      if (templateBody) {
        params.TemplateBody = templateBody;
      } else if (templateUrl) {
        params.TemplateURL = templateUrl;
      } else {
        throw new Error('Either templateBody or templateUrl must be provided');
      }

      const result = await this.cloudFormation.createStack(params).promise();

      return {
        success: true,
        stack: {
          stackId: result.StackId,
          stackName: stackName
        }
      };
    } catch (error) {
      logger.error('Failed to deploy CloudFormation stack:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getStackStatus(stackName) {
    try {
      const result = await this.cloudFormation.describeStacks({
        StackName: stackName
      }).promise();

      const stack = result.Stacks[0];

      return {
        success: true,
        stack: {
          stackName: stack.StackName,
          stackStatus: stack.StackStatus,
          creationTime: stack.CreationTime,
          lastUpdatedTime: stack.LastUpdatedTime,
          outputs: stack.Outputs || []
        }
      };
    } catch (error) {
      logger.error('Failed to get stack status:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // ECS Operations
  async createECSCluster(options) {
    const { clusterName, tags = [] } = options;

    try {
      const result = await this.ecs.createCluster({
        clusterName: clusterName,
        tags: tags
      }).promise();

      return {
        success: true,
        cluster: {
          clusterArn: result.cluster.clusterArn,
          clusterName: result.cluster.clusterName,
          status: result.cluster.status,
          runningTasksCount: result.cluster.runningTasksCount,
          pendingTasksCount: result.cluster.pendingTasksCount
        }
      };
    } catch (error) {
      logger.error('Failed to create ECS cluster:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Utility Methods
  async getRegions() {
    try {
      const result = await this.ec2.describeRegions().promise();
      
      return {
        success: true,
        regions: result.Regions.map(region => ({
          regionName: region.RegionName,
          endpoint: region.Endpoint
        }))
      };
    } catch (error) {
      logger.error('Failed to get regions:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getAccountInfo() {
    try {
      const stsClient = new AWS.STS();
      const result = await stsClient.getCallerIdentity().promise();
      
      return {
        success: true,
        account: {
          userId: result.UserId,
          account: result.Account,
          arn: result.Arn
        }
      };
    } catch (error) {
      logger.error('Failed to get account info:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async estimateCosts(options) {
    const { 
      instanceType = 't2.micro',
      instanceCount = 1,
      storageGB = 20,
      region = this.region 
    } = options;

    // This is a simplified cost estimation
    // In practice, you would use AWS Pricing API
    const pricing = {
      't2.micro': 0.0116, // per hour
      't2.small': 0.023,
      't2.medium': 0.046,
      't3.micro': 0.0104,
      't3.small': 0.0208,
      't3.medium': 0.0416
    };

    const storagePrice = 0.10; // per GB per month

    const instanceHourlyCost = pricing[instanceType] || 0.02;
    const monthlyCost = (instanceHourlyCost * 24 * 30 * instanceCount) + (storageGB * storagePrice);

    return {
      success: true,
      estimate: {
        instanceType: instanceType,
        instanceCount: instanceCount,
        storageGB: storageGB,
        region: region,
        hourlyCost: instanceHourlyCost * instanceCount,
        dailyCost: instanceHourlyCost * 24 * instanceCount,
        monthlyCost: monthlyCost,
        currency: 'USD'
      }
    };
  }

  // Configuration methods
  setCredentials(accessKeyId, secretAccessKey) {
    this.accessKeyId = accessKeyId;
    this.secretAccessKey = secretAccessKey;
    
    AWS.config.update({
      accessKeyId: accessKeyId,
      secretAccessKey: secretAccessKey,
      region: this.region
    });
  }

  setRegion(region) {
    this.region = region;
    AWS.config.update({ region: region });
  }

  setTimeout(timeout) {
    this.timeout = timeout;
    AWS.config.update({ timeout: timeout });
  }

  // Generate Infrastructure as Code
  generateCloudFormationTemplate(options) {
    const { 
      templateType = 'vpc',
      includeBastion = false,
      includeNAT = false,
      includeDatabase = false 
    } = options;

    const templates = {
      vpc: {
        AWSTemplateFormatVersion: '2010-09-09',
        Description: 'VPC with public and private subnets',
        Resources: {
          VPC: {
            Type: 'AWS::EC2::VPC',
            Properties: {
              CidrBlock: '10.0.0.0/16',
              EnableDnsHostnames: true,
              EnableDnsSupport: true,
              Tags: [{ Key: 'Name', Value: 'Main-VPC' }]
            }
          },
          PublicSubnet: {
            Type: 'AWS::EC2::Subnet',
            Properties: {
              VpcId: { Ref: 'VPC' },
              CidrBlock: '10.0.1.0/24',
              AvailabilityZone: { 'Fn::Select': [0, { 'Fn::GetAZs': '' }] },
              MapPublicIpOnLaunch: true,
              Tags: [{ Key: 'Name', Value: 'Public-Subnet' }]
            }
          },
          PrivateSubnet: {
            Type: 'AWS::EC2::Subnet',
            Properties: {
              VpcId: { Ref: 'VPC' },
              CidrBlock: '10.0.2.0/24',
              AvailabilityZone: { 'Fn::Select': [1, { 'Fn::GetAZs': '' }] },
              Tags: [{ Key: 'Name', Value: 'Private-Subnet' }]
            }
          },
          InternetGateway: {
            Type: 'AWS::EC2::InternetGateway',
            Properties: {
              Tags: [{ Key: 'Name', Value: 'Main-IGW' }]
            }
          },
          AttachGateway: {
            Type: 'AWS::EC2::VPCGatewayAttachment',
            Properties: {
              VpcId: { Ref: 'VPC' },
              InternetGatewayId: { Ref: 'InternetGateway' }
            }
          }
        },
        Outputs: {
          VPCId: {
            Description: 'VPC ID',
            Value: { Ref: 'VPC' },
            Export: { Name: { 'Fn::Sub': '${AWS::StackName}-VPC-ID' } }
          }
        }
      }
    };

    return {
      success: true,
      template: JSON.stringify(templates[templateType], null, 2),
      templateType: templateType
    };
  }
}

module.exports = { AWSIntegration };