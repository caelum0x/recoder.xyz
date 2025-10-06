import { NextResponse } from 'next/server';
import { S3Client, PutObjectCommand, ListObjectsCommand } from '@aws-sdk/client-s3';
import { LambdaClient, InvokeCommand, CreateFunctionCommand } from '@aws-sdk/client-lambda';
import { RDSClient, CreateDBInstanceCommand } from '@aws-sdk/client-rds';
import { EC2Client, DescribeInstancesCommand, StartInstancesCommand, StopInstancesCommand } from '@aws-sdk/client-ec2';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { CloudWatchClient, GetMetricStatisticsCommand } from '@aws-sdk/client-cloudwatch';
import { CloudFormationClient, CreateStackCommand } from '@aws-sdk/client-cloudformation';

// ☁️ AWS INTEGRATION - REAL CLOUD SERVICES MANAGEMENT
// Complete AWS SDK v3 integration with S3, Lambda, RDS, EC2, and more

// Configure AWS SDK v3 clients
const awsConfig = {
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
  region: process.env.AWS_REGION || 'us-east-1'
};

const s3Client = new S3Client(awsConfig);
const lambdaClient = new LambdaClient(awsConfig);
const rdsClient = new RDSClient(awsConfig);
const ec2Client = new EC2Client(awsConfig);
const snsClient = new SNSClient(awsConfig);
const sqsClient = new SQSClient(awsConfig);
const cloudWatchClient = new CloudWatchClient(awsConfig);
const cloudFormationClient = new CloudFormationClient(awsConfig);

interface AWSAction {
  action: 'upload_to_s3' | 'list_s3_objects' | 'invoke_lambda' | 'create_lambda' | 'list_ec2_instances' | 'start_ec2_instance' | 'stop_ec2_instance' | 'create_rds_instance' | 'send_sns_notification' | 'send_sqs_message' | 'get_cloudwatch_metrics' | 'deploy_cloudformation';
  data?: any;
}

export async function POST(request: Request) {
  try {
    const body: AWSAction = await request.json();
    const { action, data } = body;

    let result;

    switch (action) {
      case 'upload_to_s3':
        result = await uploadToS3(data);
        break;
        
      case 'list_s3_objects':
        result = await listS3Objects(data);
        break;
        
      case 'invoke_lambda':
        result = await invokeLambda(data);
        break;
        
      case 'create_lambda':
        result = await createLambda(data);
        break;
        
      case 'list_ec2_instances':
        result = await listEC2Instances(data);
        break;
        
      case 'start_ec2_instance':
        result = await startEC2Instance(data);
        break;
        
      case 'stop_ec2_instance':
        result = await stopEC2Instance(data);
        break;
        
      case 'create_rds_instance':
        result = await createRDSInstance(data);
        break;
        
      case 'send_sns_notification':
        result = await sendSNSNotification(data);
        break;
        
      case 'send_sqs_message':
        result = await sendSQSMessage(data);
        break;
        
      case 'get_cloudwatch_metrics':
        result = await getCloudWatchMetrics(data);
        break;
        
      case 'deploy_cloudformation':
        result = await deployCloudFormation(data);
        break;
        
      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action' },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      result,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('AWS API Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'AWS integration failed',
        code: error.code || 'AWS_ERROR'
      },
      { status: 500 }
    );
  }
}

// Upload file to S3 with advanced options
async function uploadToS3(data: any) {
  const command = new PutObjectCommand({
    Bucket: data.bucket,
    Key: data.key,
    Body: data.body,
    ContentType: data.content_type,
    ContentEncoding: data.content_encoding,
    ContentDisposition: data.content_disposition,
    CacheControl: data.cache_control,
    Expires: data.expires,
    Metadata: data.metadata || {},
    ACL: data.acl || 'private',
    StorageClass: data.storage_class || 'STANDARD',
    ServerSideEncryption: data.server_side_encryption,
    SSEKMSKeyId: data.sse_kms_key_id,
    Tagging: data.tagging,
    WebsiteRedirectLocation: data.website_redirect_location
  });

  const result = await s3Client.send(command);

  return {
    location: `https://${data.bucket}.s3.${awsConfig.region}.amazonaws.com/${data.key}`,
    bucket: data.bucket,
    key: data.key,
    etag: result.ETag,
    version_id: result.VersionId,
    server_side_encryption: result.ServerSideEncryption
  };
}

// List S3 objects with filtering
async function listS3Objects(data: any) {
  const command = new ListObjectsCommand({
    Bucket: data.bucket,
    Prefix: data.prefix,
    Delimiter: data.delimiter,
    MaxKeys: data.max_keys || 1000,
    Marker: data.marker,
    EncodingType: data.encoding_type
  });

  const result = await s3Client.send(command);

  return {
    objects: result.Contents?.map(obj => ({
      key: obj.Key,
      last_modified: obj.LastModified,
      etag: obj.ETag,
      size: obj.Size,
      storage_class: obj.StorageClass,
      owner: obj.Owner
    })) || [],
    common_prefixes: result.CommonPrefixes?.map(prefix => prefix.Prefix) || [],
    is_truncated: result.IsTruncated,
    next_marker: result.NextMarker,
    max_keys: result.MaxKeys
  };
}

// Invoke Lambda function
async function invokeLambda(data: any) {
  const command = new InvokeCommand({
    FunctionName: data.function_name,
    InvocationType: data.invocation_type || 'RequestResponse',
    LogType: data.log_type || 'None',
    Payload: JSON.stringify(data.payload || {}),
    ClientContext: data.client_context,
    Qualifier: data.qualifier
  });

  const result = await lambdaClient.send(command);

  return {
    status_code: result.StatusCode,
    function_error: result.FunctionError,
    log_result: result.LogResult,
    payload: result.Payload ? JSON.parse(result.Payload.toString()) : null,
    executed_version: result.ExecutedVersion
  };
}

// Create Lambda function
async function createLambda(data: any) {
  const command = new CreateFunctionCommand({
    FunctionName: data.function_name,
    Runtime: data.runtime || 'nodejs18.x',
    Role: data.role,
    Handler: data.handler,
    Code: {
      ZipFile: data.zip_file,
      S3Bucket: data.s3_bucket,
      S3Key: data.s3_key,
      S3ObjectVersion: data.s3_object_version
    },
    Description: data.description,
    Timeout: data.timeout || 30,
    MemorySize: data.memory_size || 128,
    Environment: {
      Variables: data.environment_variables || {}
    },
    DeadLetterConfig: data.dead_letter_config,
    KMSKeyArn: data.kms_key_arn,
    TracingConfig: data.tracing_config,
    Tags: data.tags || {},
    Layers: data.layers,
    FileSystemConfigs: data.file_system_configs,
    ImageConfig: data.image_config,
    CodeSigningConfigArn: data.code_signing_config_arn,
    Architectures: data.architectures || ['x86_64']
  });

  const result = await lambdaClient.send(command);

  return {
    function_name: result.FunctionName,
    function_arn: result.FunctionArn,
    runtime: result.Runtime,
    role: result.Role,
    handler: result.Handler,
    code_size: result.CodeSize,
    description: result.Description,
    timeout: result.Timeout,
    memory_size: result.MemorySize,
    last_modified: result.LastModified,
    code_sha256: result.CodeSha256,
    version: result.Version,
    state: result.State
  };
}

// List EC2 instances
async function listEC2Instances(data: any = {}) {
  const command = new DescribeInstancesCommand({
    Filters: data.filters,
    InstanceIds: data.instance_ids,
    MaxResults: data.max_results,
    NextToken: data.next_token
  });

  const result = await ec2Client.send(command);

  const instances: any[] = [];
  result.Reservations?.forEach(reservation => {
    reservation.Instances?.forEach(instance => {
      instances.push({
        instance_id: instance.InstanceId,
        instance_type: instance.InstanceType,
        state: instance.State,
        public_ip_address: instance.PublicIpAddress,
        private_ip_address: instance.PrivateIpAddress,
        public_dns_name: instance.PublicDnsName,
        private_dns_name: instance.PrivateDnsName,
        key_name: instance.KeyName,
        security_groups: instance.SecurityGroups,
        subnet_id: instance.SubnetId,
        vpc_id: instance.VpcId,
        launch_time: instance.LaunchTime,
        availability_zone: instance.Placement?.AvailabilityZone,
        tags: instance.Tags
      });
    });
  });

  return {
    instances,
    next_token: result.NextToken
  };
}

// Start EC2 instance
async function startEC2Instance(data: any) {
  const command = new StartInstancesCommand({
    InstanceIds: [data.instance_id],
    DryRun: data.dry_run || false
  });

  const result = await ec2Client.send(command);

  return {
    starting_instances: result.StartingInstances?.map(instance => ({
      instance_id: instance.InstanceId,
      current_state: instance.CurrentState,
      previous_state: instance.PreviousState
    }))
  };
}

// Stop EC2 instance
async function stopEC2Instance(data: any) {
  const command = new StopInstancesCommand({
    InstanceIds: [data.instance_id],
    DryRun: data.dry_run || false,
    Force: data.force || false,
    Hibernate: data.hibernate || false
  });

  const result = await ec2Client.send(command);

  return {
    stopping_instances: result.StoppingInstances?.map(instance => ({
      instance_id: instance.InstanceId,
      current_state: instance.CurrentState,
      previous_state: instance.PreviousState
    }))
  };
}

// Create RDS instance
async function createRDSInstance(data: any) {
  const command = new CreateDBInstanceCommand({
    DBInstanceIdentifier: data.db_instance_identifier,
    DBInstanceClass: data.db_instance_class || 'db.t3.micro',
    Engine: data.engine || 'mysql',
    EngineVersion: data.engine_version,
    MasterUsername: data.master_username,
    MasterUserPassword: data.master_user_password,
    AllocatedStorage: data.allocated_storage || 20,
    StorageType: data.storage_type || 'gp2',
    StorageEncrypted: data.storage_encrypted || false,
    DBName: data.db_name,
    VpcSecurityGroupIds: data.vpc_security_group_ids,
    DBSubnetGroupName: data.db_subnet_group_name,
    AvailabilityZone: data.availability_zone,
    MultiAZ: data.multi_az || false,
    PubliclyAccessible: data.publicly_accessible || false,
    AutoMinorVersionUpgrade: data.auto_minor_version_upgrade !== false,
    BackupRetentionPeriod: data.backup_retention_period || 1,
    PreferredBackupWindow: data.preferred_backup_window,
    PreferredMaintenanceWindow: data.preferred_maintenance_window,
    Port: data.port,
    Tags: data.tags || []
  });

  const result = await rdsClient.send(command);

  return {
    db_instance_identifier: result.DBInstance?.DBInstanceIdentifier,
    db_instance_status: result.DBInstance?.DBInstanceStatus,
    engine: result.DBInstance?.Engine,
    engine_version: result.DBInstance?.EngineVersion,
    db_instance_class: result.DBInstance?.DBInstanceClass,
    allocated_storage: result.DBInstance?.AllocatedStorage,
    endpoint: result.DBInstance?.Endpoint,
    availability_zone: result.DBInstance?.AvailabilityZone,
    multi_az: result.DBInstance?.MultiAZ,
    publicly_accessible: result.DBInstance?.PubliclyAccessible
  };
}

// Send SNS notification
async function sendSNSNotification(data: any) {
  const command = new PublishCommand({
    Message: data.message,
    TopicArn: data.topic_arn,
    Subject: data.subject,
    MessageStructure: data.message_structure,
    MessageAttributes: data.message_attributes,
    MessageDeduplicationId: data.message_deduplication_id,
    MessageGroupId: data.message_group_id
  });

  const result = await snsClient.send(command);

  return {
    message_id: result.MessageId,
    sequence_number: result.SequenceNumber
  };
}

// Send SQS message
async function sendSQSMessage(data: any) {
  const command = new SendMessageCommand({
    QueueUrl: data.queue_url,
    MessageBody: data.message_body,
    DelaySeconds: data.delay_seconds,
    MessageAttributes: data.message_attributes,
    MessageSystemAttributes: data.message_system_attributes,
    MessageDeduplicationId: data.message_deduplication_id,
    MessageGroupId: data.message_group_id
  });

  const result = await sqsClient.send(command);

  return {
    message_id: result.MessageId,
    md5_of_body: (result as any).MD5OfBody,
    md5_of_message_attributes: result.MD5OfMessageAttributes,
    sequence_number: result.SequenceNumber
  };
}

// Get CloudWatch metrics
async function getCloudWatchMetrics(data: any) {
  const command = new GetMetricStatisticsCommand({
    Namespace: data.namespace,
    MetricName: data.metric_name,
    Dimensions: data.dimensions,
    StartTime: new Date(data.start_time),
    EndTime: new Date(data.end_time),
    Period: data.period || 300,
    Statistics: data.statistics || ['Average']
  });

  const result = await cloudWatchClient.send(command);

  return {
    label: result.Label,
    datapoints: result.Datapoints?.map(point => ({
      timestamp: point.Timestamp,
      average: point.Average,
      maximum: point.Maximum,
      minimum: point.Minimum,
      sample_count: point.SampleCount,
      sum: point.Sum,
      unit: point.Unit
    }))
  };
}

// Deploy CloudFormation stack
async function deployCloudFormation(data: any) {
  const command = new CreateStackCommand({
    StackName: data.stack_name,
    TemplateBody: data.template_body,
    TemplateURL: data.template_url,
    Parameters: data.parameters,
    Capabilities: data.capabilities || ['CAPABILITY_IAM'],
    RoleARN: data.role_arn,
    OnFailure: data.on_failure || 'ROLLBACK',
    StackPolicyBody: data.stack_policy_body,
    StackPolicyURL: data.stack_policy_url,
    Tags: data.tags || [],
    TimeoutInMinutes: data.timeout_in_minutes,
    NotificationARNs: data.notification_arns || [],
    EnableTerminationProtection: data.enable_termination_protection || false
  });

  const result = await cloudFormationClient.send(command);

  return {
    stack_id: result.StackId
  };
}

export async function GET() {
  return NextResponse.json({
    service: 'AWS Integration',
    status: 'operational',
    features: [
      'S3 Storage Management',
      'Lambda Function Execution',
      'EC2 Instance Management',
      'RDS Database Creation',
      'SNS Notifications',
      'SQS Message Queue',
      'CloudWatch Metrics',
      'CloudFormation Deployment'
    ],
    endpoints: {
      s3: ['upload_to_s3', 'list_s3_objects'],
      lambda: ['invoke_lambda', 'create_lambda'],
      ec2: ['list_ec2_instances', 'start_ec2_instance', 'stop_ec2_instance'],
      rds: ['create_rds_instance'],
      sns: ['send_sns_notification'],
      sqs: ['send_sqs_message'],
      cloudwatch: ['get_cloudwatch_metrics'],
      cloudformation: ['deploy_cloudformation']
    },
    supported_services: [
      'S3',
      'Lambda',
      'EC2',
      'RDS',
      'SNS',
      'SQS',
      'CloudWatch',
      'CloudFormation'
    ]
  });
}