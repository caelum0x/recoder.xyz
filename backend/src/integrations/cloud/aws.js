const { 
  EC2Client, 
  RunInstancesCommand, 
  DescribeInstancesCommand, 
  TerminateInstancesCommand,
  CreateVpcCommand,
  CreateSubnetCommand,
  CreateInternetGatewayCommand,
  AttachInternetGatewayCommand,
  DescribeRegionsCommand
} = require('@aws-sdk/client-ec2');

const { 
  S3Client, 
  CreateBucketCommand, 
  PutObjectCommand, 
  GetObjectCommand 
} = require('@aws-sdk/client-s3');

const { 
  LambdaClient, 
  CreateFunctionCommand, 
  InvokeCommand 
} = require('@aws-sdk/client-lambda');

const { 
  RDSClient, 
  CreateDBInstanceCommand 
} = require('@aws-sdk/client-rds');

const { 
  CloudFormationClient, 
  CreateStackCommand, 
  DescribeStacksCommand 
} = require('@aws-sdk/client-cloudformation');

const { 
  IAMClient 
} = require('@aws-sdk/client-iam');

const { 
  ECSClient, 
  CreateClusterCommand 
} = require('@aws-sdk/client-ecs');

const { 
  EKSClient 
} = require('@aws-sdk/client-eks');

const { 
  ElasticBeanstalkClient 
} = require('@aws-sdk/client-elastic-beanstalk');

const { 
  Route53Client 
} = require('@aws-sdk/client-route-53');

const { 
  CloudWatchClient 
} = require('@aws-sdk/client-cloudwatch');

const { 
  SNSClient 
} = require('@aws-sdk/client-sns');

const { 
  SQSClient 
} = require('@aws-sdk/client-sqs');

const { 
  STSClient, 
  GetCallerIdentityCommand 
} = require('@aws-sdk/client-sts');

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
    
    // Common client configuration
    const clientConfig = {
      region: this.region,
      credentials: {
        accessKeyId: this.accessKeyId,
        secretAccessKey: this.secretAccessKey,
      },
      requestHandler: {
        requestTimeout: this.timeout
      }
    };

    // Initialize AWS SDK v3 clients
    this.ec2 = new EC2Client(clientConfig);
    this.s3 = new S3Client(clientConfig);
    this.lambda = new LambdaClient(clientConfig);
    this.rds = new RDSClient(clientConfig);
    this.cloudFormation = new CloudFormationClient(clientConfig);
    this.iam = new IAMClient(clientConfig);
    this.vpc = new EC2Client(clientConfig); // VPC operations use EC2 client
    this.ecs = new ECSClient(clientConfig);
    this.eks = new EKSClient(clientConfig);
    this.elasticBeanstalk = new ElasticBeanstalkClient(clientConfig);
    this.route53 = new Route53Client(clientConfig);
    this.cloudWatch = new CloudWatchClient(clientConfig);
    this.sns = new SNSClient(clientConfig);
    this.sqs = new SQSClient(clientConfig);
    this.sts = new STSClient(clientConfig);
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
      const command = new RunInstancesCommand({
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
      });

      const result = await this.ec2.send(command);
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
      const command = new DescribeInstancesCommand({});
      const result = await this.ec2.send(command);
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
      const command = new TerminateInstancesCommand({
        InstanceIds: [instanceId]
      });
      
      await this.ec2.send(command);

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
      const command = new CreateBucketCommand({
        Bucket: bucketName,
        ACL: acl,
        ...(region !== 'us-east-1' && {
          CreateBucketConfiguration: {
            LocationConstraint: region
          }
        })
      });

      await this.s3.send(command);

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
      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: body,
        ContentType: contentType,
        Metadata: metadata
      });

      const result = await this.s3.send(command);

      return {
        success: true,
        upload: {
          location: `https://${bucketName}.s3.${this.region}.amazonaws.com/${key}`,
          bucket: bucketName,
          key: key,
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
      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: key
      });

      const result = await this.s3.send(command);

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
      const command = new CreateFunctionCommand({
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
      });

      const result = await this.lambda.send(command);

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
      const command = new InvokeCommand({
        FunctionName: functionName,
        InvocationType: invocationType,
        Payload: JSON.stringify(payload)
      });

      const result = await this.lambda.send(command);

      return {
        success: true,
        invocation: {
          statusCode: result.StatusCode,
          payload: result.Payload ? JSON.parse(Buffer.from(result.Payload).toString()) : null,
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
      const command = new CreateDBInstanceCommand({
        DBInstanceIdentifier: dbInstanceIdentifier,
        DBInstanceClass: dbInstanceClass,
        Engine: engine,
        MasterUsername: masterUsername,
        MasterUserPassword: masterUserPassword,
        AllocatedStorage: allocatedStorage,
        DBName: dbName,
        VpcSecurityGroupIds: vpcSecurityGroupIds,
        DBSubnetGroupName: dbSubnetGroupName
      });

      const result = await this.rds.send(command);

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
      const vpcCommand = new CreateVpcCommand({
        CidrBlock: cidrBlock,
        TagSpecifications: tags.length > 0 ? [{
          ResourceType: 'vpc',
          Tags: tags
        }] : undefined
      });

      const vpcResult = await this.vpc.send(vpcCommand);
      const vpcId = vpcResult.Vpc.VpcId;

      // Create Internet Gateway
      const igwCommand = new CreateInternetGatewayCommand({});
      const igwResult = await this.vpc.send(igwCommand);
      const igwId = igwResult.InternetGateway.InternetGatewayId;

      // Attach Internet Gateway to VPC
      const attachCommand = new AttachInternetGatewayCommand({
        InternetGatewayId: igwId,
        VpcId: vpcId
      });
      await this.vpc.send(attachCommand);

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
      const command = new CreateSubnetCommand({
        VpcId: vpcId,
        CidrBlock: cidrBlock,
        AvailabilityZone: availabilityZone,
        TagSpecifications: tags.length > 0 ? [{
          ResourceType: 'subnet',
          Tags: tags
        }] : undefined
      });

      const result = await this.vpc.send(command);

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
      const command = new CreateStackCommand({
        StackName: stackName,
        Parameters: parameters,
        Capabilities: capabilities,
        Tags: tags,
        ...(templateBody && { TemplateBody: templateBody }),
        ...(templateUrl && { TemplateURL: templateUrl })
      });

      if (!templateBody && !templateUrl) {
        throw new Error('Either templateBody or templateUrl must be provided');
      }

      const result = await this.cloudFormation.send(command);

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
      const command = new DescribeStacksCommand({
        StackName: stackName
      });

      const result = await this.cloudFormation.send(command);
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
      const command = new CreateClusterCommand({
        clusterName: clusterName,
        tags: tags
      });

      const result = await this.ecs.send(command);

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
      const command = new DescribeRegionsCommand({});
      const result = await this.ec2.send(command);
      
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
      const command = new GetCallerIdentityCommand({});
      const result = await this.sts.send(command);
      
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
    
    // Note: AWS SDK v3 requires recreating clients with new credentials
    logger.info('AWS credentials updated - client recreation required for changes to take effect');
  }

  setRegion(region) {
    this.region = region;
    logger.info(`AWS region updated to ${region} - client recreation required for changes to take effect`);
  }

  setTimeout(timeout) {
    this.timeout = timeout;
    logger.info(`AWS timeout updated to ${timeout}ms - client recreation required for changes to take effect`);
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