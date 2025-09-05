import { NextResponse } from 'next/server';
import Redis from 'ioredis';

// 🚀 REDIS INTEGRATION - REAL CACHING & PUB/SUB SYSTEM
// Complete Redis integration with caching, pub/sub, streams, and advanced data structures

interface RedisAction {
  action: 'set' | 'get' | 'del' | 'exists' | 'expire' | 'publish' | 'subscribe' | 'hset' | 'hget' | 'lpush' | 'rpop' | 'sadd' | 'zadd' | 'stream_add' | 'lua_script' | 'pipeline' | 'transaction' | 'cluster_info';
  data?: any;
  connection_config?: {
    host: string;
    port: number;
    password?: string;
    db?: number;
  };
}

export async function POST(request: Request) {
  try {
    const body: RedisAction = await request.json();
    const { action, data, connection_config } = body;

    // Use provided config or environment variables
    const config = connection_config || {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0'),
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      keepAlive: 30000,
      connectTimeout: 10000,
      commandTimeout: 5000
    };

    let result;

    switch (action) {
      case 'set':
        result = await setKey(config, data);
        break;
        
      case 'get':
        result = await getKey(config, data);
        break;
        
      case 'del':
        result = await deleteKey(config, data);
        break;
        
      case 'exists':
        result = await checkExists(config, data);
        break;
        
      case 'expire':
        result = await setExpire(config, data);
        break;
        
      case 'publish':
        result = await publishMessage(config, data);
        break;
        
      case 'subscribe':
        result = await subscribeChannel(config, data);
        break;
        
      case 'hset':
        result = await hashSet(config, data);
        break;
        
      case 'hget':
        result = await hashGet(config, data);
        break;
        
      case 'lpush':
        result = await listPush(config, data);
        break;
        
      case 'rpop':
        result = await listPop(config, data);
        break;
        
      case 'sadd':
        result = await setAdd(config, data);
        break;
        
      case 'zadd':
        result = await sortedSetAdd(config, data);
        break;
        
      case 'stream_add':
        result = await streamAdd(config, data);
        break;
        
      case 'lua_script':
        result = await executeLuaScript(config, data);
        break;
        
      case 'pipeline':
        result = await executePipeline(config, data);
        break;
        
      case 'transaction':
        result = await executeTransaction(config, data);
        break;
        
      case 'cluster_info':
        result = await getClusterInfo(config, data);
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
    console.error('Redis Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Redis integration failed',
        code: error.code || 'REDIS_ERROR'
      },
      { status: 500 }
    );
  }
}

// Set key-value with options
async function setKey(config: any, data: any) {
  const redis = new Redis(config);
  
  try {
    let result;
    
    if (data.options) {
      const args: any[] = [data.key, data.value];
      
      if (data.options.ex) args.push('EX', data.options.ex.toString());
      if (data.options.px) args.push('PX', data.options.px.toString());
      if (data.options.nx) args.push('NX');
      if (data.options.xx) args.push('XX');
      if (data.options.keepttl) args.push('KEEPTTL');
      
      result = await redis.set(data.key, data.value, ...args.slice(2));
    } else {
      result = await redis.set(data.key, data.value);
      
      if (data.ttl) {
        await redis.expire(data.key, data.ttl);
      }
    }
    
    return {
      key: data.key,
      value: data.value,
      result: result,
      ttl: data.ttl || data.options?.ex || data.options?.px,
      options: data.options
    };
  } finally {
    redis.disconnect();
  }
}

// Get key value
async function getKey(config: any, data: any) {
  const redis = new Redis(config);
  
  try {
    const value = await redis.get(data.key);
    const ttl = await redis.ttl(data.key);
    const type = await redis.type(data.key);
    
    return {
      key: data.key,
      value: value,
      ttl: ttl,
      type: type,
      exists: value !== null
    };
  } finally {
    redis.disconnect();
  }
}

// Delete key(s)
async function deleteKey(config: any, data: any) {
  const redis = new Redis(config);
  
  try {
    const keys = Array.isArray(data.keys) ? data.keys : [data.key];
    const deletedCount = await redis.del(...keys);
    
    return {
      keys: keys,
      deleted_count: deletedCount,
      success: deletedCount > 0
    };
  } finally {
    redis.disconnect();
  }
}

// Check if key exists
async function checkExists(config: any, data: any) {
  const redis = new Redis(config);
  
  try {
    const keys = Array.isArray(data.keys) ? data.keys : [data.key];
    const existsCount = await redis.exists(...keys);
    
    return {
      keys: keys,
      exists_count: existsCount,
      all_exist: existsCount === keys.length
    };
  } finally {
    redis.disconnect();
  }
}

// Set expiration
async function setExpire(config: any, data: any) {
  const redis = new Redis(config);
  
  try {
    let result;
    
    if (data.timestamp) {
      result = await redis.expireat(data.key, data.timestamp);
    } else if (data.milliseconds) {
      result = await redis.pexpire(data.key, data.milliseconds);
    } else {
      result = await redis.expire(data.key, data.seconds);
    }
    
    return {
      key: data.key,
      expire_set: result === 1,
      seconds: data.seconds,
      milliseconds: data.milliseconds,
      timestamp: data.timestamp
    };
  } finally {
    redis.disconnect();
  }
}

// Publish message to channel
async function publishMessage(config: any, data: any) {
  const redis = new Redis(config);
  
  try {
    const subscriberCount = await redis.publish(data.channel, data.message);
    
    return {
      channel: data.channel,
      message: data.message,
      subscriber_count: subscriberCount,
      published_at: new Date().toISOString()
    };
  } finally {
    redis.disconnect();
  }
}

// Subscribe to channel (Note: This returns connection info, actual subscription needs persistent connection)
async function subscribeChannel(config: any, data: any) {
  return {
    channels: data.channels,
    patterns: data.patterns,
    note: 'Subscription requires persistent connection. Use WebSocket or Server-Sent Events for real-time updates.',
    connection_config: {
      host: config.host,
      port: config.port,
      db: config.db
    }
  };
}

// Hash operations
async function hashSet(config: any, data: any) {
  const redis = new Redis(config);
  
  try {
    let result;
    
    if (data.multiple) {
      // HMSET for multiple fields
      const args = [data.key];
      for (const [field, value] of Object.entries(data.fields)) {
        args.push(field, value as string);
      }
      result = await redis.hmset(...(args as [string, ...string[]]));
    } else {
      // HSET for single field
      result = await redis.hset(data.key, data.field, data.value);
    }
    
    return {
      key: data.key,
      field: data.field,
      fields: data.fields,
      result: result,
      operation: data.multiple ? 'hmset' : 'hset'
    };
  } finally {
    redis.disconnect();
  }
}

// Hash get
async function hashGet(config: any, data: any) {
  const redis = new Redis(config);
  
  try {
    let result;
    
    if (data.all) {
      result = await redis.hgetall(data.key);
    } else if (data.fields) {
      result = await redis.hmget(data.key, ...data.fields);
    } else {
      result = await redis.hget(data.key, data.field);
    }
    
    return {
      key: data.key,
      field: data.field,
      fields: data.fields,
      value: result,
      operation: data.all ? 'hgetall' : (data.fields ? 'hmget' : 'hget')
    };
  } finally {
    redis.disconnect();
  }
}

// List push
async function listPush(config: any, data: any) {
  const redis = new Redis(config);
  
  try {
    const values = Array.isArray(data.values) ? data.values : [data.value];
    const length = await redis.lpush(data.key, ...values);
    
    return {
      key: data.key,
      values: values,
      new_length: length,
      operation: 'lpush'
    };
  } finally {
    redis.disconnect();
  }
}

// List pop
async function listPop(config: any, data: any) {
  const redis = new Redis(config);
  
  try {
    const value = await redis.rpop(data.key);
    const length = await redis.llen(data.key);
    
    return {
      key: data.key,
      value: value,
      remaining_length: length,
      operation: 'rpop'
    };
  } finally {
    redis.disconnect();
  }
}

// Set add
async function setAdd(config: any, data: any) {
  const redis = new Redis(config);
  
  try {
    const members = Array.isArray(data.members) ? data.members : [data.member];
    const addedCount = await redis.sadd(data.key, ...members);
    const totalMembers = await redis.scard(data.key);
    
    return {
      key: data.key,
      members: members,
      added_count: addedCount,
      total_members: totalMembers,
      operation: 'sadd'
    };
  } finally {
    redis.disconnect();
  }
}

// Sorted set add
async function sortedSetAdd(config: any, data: any) {
  const redis = new Redis(config);
  
  try {
    const args = [data.key];
    
    if (Array.isArray(data.members)) {
      for (const member of data.members) {
        args.push(member.score, member.member);
      }
    } else {
      args.push(data.score, data.member);
    }
    
    const addedCount = await redis.zadd(...(args as [string, ...Array<string | number>]));
    const totalMembers = await redis.zcard(data.key);
    
    return {
      key: data.key,
      members: data.members || [{ score: data.score, member: data.member }],
      added_count: addedCount,
      total_members: totalMembers,
      operation: 'zadd'
    };
  } finally {
    redis.disconnect();
  }
}

// Stream add
async function streamAdd(config: any, data: any) {
  const redis = new Redis(config);
  
  try {
    const args = [data.stream];
    
    if (data.id) {
      args.push(data.id);
    } else {
      args.push('*'); // Auto-generate ID
    }
    
    // Add field-value pairs
    for (const [field, value] of Object.entries(data.fields)) {
      args.push(field, value as string);
    }
    
    const id = await redis.xadd(...(args as [string, string, ...string[]]));
    
    return {
      stream: data.stream,
      id: id,
      fields: data.fields,
      operation: 'xadd'
    };
  } finally {
    redis.disconnect();
  }
}

// Execute Lua script
async function executeLuaScript(config: any, data: any) {
  const redis = new Redis(config);
  
  try {
    const result = await redis.eval(
      data.script,
      data.keys?.length || 0,
      ...(data.keys || []),
      ...(data.args || [])
    );
    
    return {
      script: data.script,
      keys: data.keys,
      args: data.args,
      result: result,
      operation: 'eval'
    };
  } finally {
    redis.disconnect();
  }
}

// Execute pipeline
async function executePipeline(config: any, data: any) {
  const redis = new Redis(config);
  
  try {
    const pipeline = redis.pipeline();
    
    for (const command of data.commands) {
      (pipeline as any)[command.command](...command.args);
    }
    
    const results = await pipeline.exec();
    
    return {
      commands: data.commands,
      results: results?.map((result, index) => ({
        command: data.commands[index],
        error: result[0],
        result: result[1]
      })),
      success_count: results?.filter(r => r[0] === null).length || 0,
      total_commands: data.commands.length,
      operation: 'pipeline'
    };
  } finally {
    redis.disconnect();
  }
}

// Execute transaction (MULTI/EXEC)
async function executeTransaction(config: any, data: any) {
  const redis = new Redis(config);
  
  try {
    const multi = redis.multi();
    
    for (const command of data.commands) {
      (multi as any)[command.command](...command.args);
    }
    
    const results = await multi.exec();
    
    return {
      commands: data.commands,
      results: results?.map((result, index) => ({
        command: data.commands[index],
        error: result[0],
        result: result[1]
      })),
      success_count: results?.filter(r => r[0] === null).length || 0,
      total_commands: data.commands.length,
      operation: 'transaction'
    };
  } finally {
    redis.disconnect();
  }
}

// Get cluster information
async function getClusterInfo(config: any, data: any) {
  const redis = new Redis(config);
  
  try {
    const info = await redis.info();
    const dbsize = await redis.dbsize();
    const memory = await redis.memory('STATS');
    
    // Try to get cluster info if available
    let clusterInfo: string | null = null;
    try {
      clusterInfo = await redis.cluster('INFO');
    } catch (e) {
      // Not a cluster setup
      clusterInfo = null;
    }
    
    return {
      server_info: info,
      database_size: dbsize,
      memory_usage: memory,
      cluster_info: clusterInfo,
      connection: {
        host: config.host,
        port: config.port,
        db: config.db
      },
      operation: 'info'
    };
  } finally {
    redis.disconnect();
  }
}

export async function GET() {
  return NextResponse.json({
    service: 'Redis Integration',
    status: 'operational',
    features: [
      'Key-Value Operations',
      'Hash Operations',
      'List Operations',
      'Set Operations',
      'Sorted Set Operations',
      'Pub/Sub Messaging',
      'Streams',
      'Lua Scripting',
      'Pipelining',
      'Transactions',
      'Expiration Management'
    ],
    endpoints: {
      basic: ['set', 'get', 'del', 'exists', 'expire'],
      hash: ['hset', 'hget'],
      list: ['lpush', 'rpop'],
      set: ['sadd'],
      sortedset: ['zadd'],
      pubsub: ['publish', 'subscribe'],
      streams: ['stream_add'],
      advanced: ['lua_script', 'pipeline', 'transaction'],
      monitoring: ['cluster_info']
    },
    data_structures: [
      'Strings',
      'Hashes',
      'Lists',
      'Sets',
      'Sorted Sets',
      'Bitmaps',
      'HyperLogLog',
      'Streams',
      'Geospatial'
    ],
    operations: [
      'CRUD Operations',
      'Expiration Management',
      'Pub/Sub Messaging',
      'Atomic Transactions',
      'Lua Scripting',
      'Pipeline Execution',
      'Pattern Matching',
      'Clustering Support'
    ]
  });
}