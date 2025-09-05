import { NextResponse } from 'next/server';
import { REST } from '@discordjs/rest';
import { 
  Routes, 
  APIUser, 
  APIGuild,
  GatewayIntentBits,
  ChannelType,
  ApplicationCommandType,
  ApplicationCommandOptionType
} from 'discord-api-types/v10';

// 🎮 DISCORD INTEGRATION - REAL BOT FRAMEWORK & SERVER MANAGEMENT
// Complete Discord bot integration with commands, events, and server management

interface DiscordAction {
  action: 'send_message' | 'create_slash_command' | 'get_guild_info' | 'manage_roles' | 'send_embed' | 'create_webhook' | 'moderate_user' | 'schedule_event' | 'get_user_info' | 'manage_channels';
  data?: any;
  bot_token?: string;
}

export async function POST(request: Request) {
  try {
    const body: DiscordAction = await request.json();
    const { action, data, bot_token } = body;

    const token = bot_token || process.env.DISCORD_BOT_TOKEN;
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Discord bot token required' },
        { status: 401 }
      );
    }

    let result;

    switch (action) {
      case 'send_message':
        result = await sendMessage(token, data);
        break;
        
      case 'create_slash_command':
        result = await createSlashCommand(token, data);
        break;
        
      case 'get_guild_info':
        result = await getGuildInfo(token, data);
        break;
        
      case 'manage_roles':
        result = await manageRoles(token, data);
        break;
        
      case 'send_embed':
        result = await sendEmbed(token, data);
        break;
        
      case 'create_webhook':
        result = await createWebhook(token, data);
        break;
        
      case 'moderate_user':
        result = await moderateUser(token, data);
        break;
        
      case 'schedule_event':
        result = await scheduleEvent(token, data);
        break;
        
      case 'get_user_info':
        result = await getUserInfo(token, data);
        break;
        
      case 'manage_channels':
        result = await manageChannels(token, data);
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
    console.error('Discord API Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Discord integration failed',
        code: error.code || 'DISCORD_ERROR'
      },
      { status: 500 }
    );
  }
}

// Send message to Discord channel
async function sendMessage(token: string, data: any) {
  const rest = new REST({ version: '10' }).setToken(token);

  const message = await rest.post(Routes.channelMessages(data.channel_id), {
    body: {
      content: data.content,
      embeds: data.embeds,
      attachments: data.files,
      components: data.components,
      tts: data.tts || false,
      allowed_mentions: data.allowed_mentions,
      message_reference: data.reply_to ? { message_id: data.reply_to } : undefined
    }
  }) as any;

  return {
    message_id: message.id,
    channel_id: message.channel_id,
    guild_id: message.guild_id,
    author: {
      id: message.author.id,
      username: message.author.username,
      discriminator: message.author.discriminator
    },
    content: message.content,
    timestamp: message.timestamp,
    url: `https://discord.com/channels/${message.guild_id}/${message.channel_id}/${message.id}`
  };
}

// Create slash command
async function createSlashCommand(token: string, data: any) {
  const rest = new REST({ version: '10' }).setToken(token);

  const command: any = {
    name: data.name,
    description: data.description,
    type: ApplicationCommandType.ChatInput,
    options: []
  };

  // Add options if provided
  if (data.options) {
    data.options.forEach((option: any) => {
      let optionType;
      switch (option.type) {
        case 'string':
          optionType = ApplicationCommandOptionType.String;
          break;
        case 'integer':
          optionType = ApplicationCommandOptionType.Integer;
          break;
        case 'boolean':
          optionType = ApplicationCommandOptionType.Boolean;
          break;
        case 'user':
          optionType = ApplicationCommandOptionType.User;
          break;
        case 'channel':
          optionType = ApplicationCommandOptionType.Channel;
          break;
        default:
          optionType = ApplicationCommandOptionType.String;
      }

      command.options.push({
        name: option.name,
        description: option.description,
        type: optionType,
        required: option.required || false
      });
    });
  }

  let result;
  if (data.guild_id) {
    // Guild-specific command
    result = await rest.post(
      Routes.applicationGuildCommands(data.application_id, data.guild_id),
      { body: command }
    );
  } else {
    // Global command
    result = await rest.post(
      Routes.applicationCommands(data.application_id),
      { body: command }
    );
  }

  return {
    command_id: (result as any).id,
    name: (result as any).name,
    description: (result as any).description,
    options: (result as any).options,
    guild_id: (result as any).guild_id
  };
}

// Get guild information
async function getGuildInfo(token: string, data: any) {
  const rest = new REST({ version: '10' }).setToken(token);

  const guild = await rest.get(Routes.guild(data.guild_id)) as any;
  const channels = await rest.get(Routes.guildChannels(data.guild_id)) as any[];
  const roles = await rest.get(Routes.guildRoles(data.guild_id)) as any[];

  return {
    guild_id: guild.id,
    name: guild.name,
    description: guild.description,
    icon: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : null,
    banner: guild.banner ? `https://cdn.discordapp.com/banners/${guild.id}/${guild.banner}.png` : null,
    splash: guild.splash ? `https://cdn.discordapp.com/splashes/${guild.id}/${guild.splash}.png` : null,
    discovery_splash: guild.discovery_splash ? `https://cdn.discordapp.com/discovery-splashes/${guild.id}/${guild.discovery_splash}.png` : null,
    owner_id: guild.owner_id,
    verification_level: guild.verification_level,
    default_message_notifications: guild.default_message_notifications,
    explicit_content_filter: guild.explicit_content_filter,
    mfa_level: guild.mfa_level,
    system_channel_id: guild.system_channel_id,
    rules_channel_id: guild.rules_channel_id,
    public_updates_channel_id: guild.public_updates_channel_id,
    preferred_locale: guild.preferred_locale,
    features: guild.features,
    premium_tier: guild.premium_tier,
    premium_subscription_count: guild.premium_subscription_count,
    approximate_member_count: guild.approximate_member_count,
    approximate_presence_count: guild.approximate_presence_count,
    channels: channels.map(channel => ({
      id: channel.id,
      name: channel.name,
      type: channel.type,
      position: channel.position,
      parent_id: channel.parent_id
    })),
    roles: roles.map(role => ({
      id: role.id,
      name: role.name,
      color: role.color,
      hoist: role.hoist,
      position: role.position,
      permissions: role.permissions,
      managed: role.managed,
      mentionable: role.mentionable
    }))
  };
}

// Manage roles (add/remove from user)
async function manageRoles(token: string, data: any) {
  const rest = new REST({ version: '10' }).setToken(token);

  let result;
  if (data.action === 'add') {
    await rest.put(Routes.guildMemberRole(data.guild_id, data.user_id, data.role_id), {
      reason: data.reason
    });
    result = { action: 'added' };
  } else if (data.action === 'remove') {
    await rest.delete(Routes.guildMemberRole(data.guild_id, data.user_id, data.role_id), {
      reason: data.reason
    });
    result = { action: 'removed' };
  }

  const role = await rest.get(Routes.guildRole(data.guild_id, data.role_id)) as any;
  const member = await rest.get(Routes.guildMember(data.guild_id, data.user_id)) as any;

  return {
    user_id: member.user.id,
    username: member.user.username,
    role_id: role.id,
    role_name: role.name,
    action: result?.action,
    reason: data.reason
  };
}

// Send rich embed message
async function sendEmbed(token: string, data: any) {
  const rest = new REST({ version: '10' }).setToken(token);

  const embed: any = {
    title: data.title,
    description: data.description,
    color: data.color ? parseInt(data.color.replace('#', ''), 16) : 0x0099ff,
    url: data.url,
    timestamp: data.timestamp || new Date().toISOString(),
    fields: data.fields || []
  };

  if (data.author) {
    embed.author = {
      name: data.author.name,
      icon_url: data.author.icon_url,
      url: data.author.url
    };
  }

  if (data.thumbnail) {
    embed.thumbnail = { url: data.thumbnail.url };
  }

  if (data.image) {
    embed.image = { url: data.image.url };
  }

  if (data.footer) {
    embed.footer = {
      text: data.footer.text,
      icon_url: data.footer.icon_url
    };
  }

  const message = await rest.post(Routes.channelMessages(data.channel_id), {
    body: {
      content: data.content,
      embeds: [embed],
      components: data.components
    }
  }) as any;

  return {
    message_id: message.id,
    channel_id: message.channel_id,
    guild_id: message.guild_id,
    url: `https://discord.com/channels/${message.guild_id}/${message.channel_id}/${message.id}`,
    timestamp: message.timestamp
  };
}

// Create webhook
async function createWebhook(token: string, data: any) {
  const rest = new REST({ version: '10' }).setToken(token);

  const webhook = await rest.post(Routes.channelWebhooks(data.channel_id), {
    body: {
      name: data.name,
      avatar: data.avatar
    },
    reason: data.reason
  }) as any;

  return {
    webhook_id: webhook.id,
    webhook_token: webhook.token,
    webhook_url: `https://discord.com/api/webhooks/${webhook.id}/${webhook.token}`,
    name: webhook.name,
    avatar: webhook.avatar ? `https://cdn.discordapp.com/avatars/${webhook.id}/${webhook.avatar}.png` : null,
    channel_id: webhook.channel_id,
    guild_id: webhook.guild_id
  };
}

// Moderate user (timeout, kick, ban)
async function moderateUser(token: string, data: any) {
  const rest = new REST({ version: '10' }).setToken(token);

  let result;
  switch (data.action) {
    case 'timeout':
      await rest.patch(Routes.guildMember(data.guild_id, data.user_id), {
        body: {
          communication_disabled_until: new Date(Date.now() + data.duration_ms).toISOString()
        },
        reason: data.reason
      });
      result = { action: 'timeout', duration_ms: data.duration_ms };
      break;
    case 'remove_timeout':
      await rest.patch(Routes.guildMember(data.guild_id, data.user_id), {
        body: {
          communication_disabled_until: null
        },
        reason: data.reason
      });
      result = { action: 'remove_timeout' };
      break;
    case 'kick':
      await rest.delete(Routes.guildMember(data.guild_id, data.user_id), {
        reason: data.reason
      });
      result = { action: 'kick' };
      break;
    case 'ban':
      await rest.put(Routes.guildBan(data.guild_id, data.user_id), {
        body: {
          delete_message_seconds: data.delete_message_seconds || 0
        },
        reason: data.reason
      });
      result = { action: 'ban', delete_message_seconds: data.delete_message_seconds };
      break;
    case 'unban':
      await rest.delete(Routes.guildBan(data.guild_id, data.user_id), {
        reason: data.reason
      });
      result = { action: 'unban' };
      break;
    default:
      throw new Error('Invalid moderation action');
  }

  return {
    user_id: data.user_id,
    guild_id: data.guild_id,
    action: result.action,
    reason: data.reason,
    moderator_id: data.moderator_id,
    timestamp: new Date().toISOString()
  };
}

// Schedule guild event
async function scheduleEvent(token: string, data: any) {
  const rest = new REST({ version: '10' }).setToken(token);

  const event = await rest.post(Routes.guildScheduledEvents(data.guild_id), {
    body: {
      name: data.name,
      scheduled_start_time: data.scheduled_start_time,
      scheduled_end_time: data.scheduled_end_time,
      privacy_level: data.privacy_level || 2,
      entity_type: data.entity_type || 2,
      description: data.description,
      channel_id: data.channel_id,
      entity_metadata: data.entity_metadata,
      image: data.image
    },
    reason: data.reason
  }) as any;

  return {
    event_id: event.id,
    name: event.name,
    description: event.description,
    scheduled_start_time: event.scheduled_start_time,
    scheduled_end_time: event.scheduled_end_time,
    privacy_level: event.privacy_level,
    status: event.status,
    entity_type: event.entity_type,
    user_count: event.user_count,
    creator_id: event.creator_id,
    url: `https://discord.com/events/${event.guild_id}/${event.id}`
  };
}

// Get user information
async function getUserInfo(token: string, data: any) {
  const rest = new REST({ version: '10' }).setToken(token);

  const user = await rest.get(Routes.user(data.user_id)) as any;
  
  let member: any = null;
  if (data.guild_id) {
    try {
      member = await rest.get(Routes.guildMember(data.guild_id, data.user_id)) as any;
    } catch (error) {
      // Member not found in guild
    }
  }

  return {
    user: {
      id: user.id,
      username: user.username,
      discriminator: user.discriminator,
      avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : null,
      bot: user.bot,
      system: user.system,
      flags: user.flags,
      premium_type: user.premium_type,
      public_flags: user.public_flags,
      accent_color: user.accent_color,
      banner: user.banner ? `https://cdn.discordapp.com/banners/${user.id}/${user.banner}.png` : null,
      created_at: new Date(parseInt(user.id) / 4194304 + 1420070400000).toISOString()
    },
    member: member ? {
      nickname: member.nick || null,
      roles: member.roles || [],
      joined_at: member.joined_at || null,
      premium_since: member.premium_since || null,
      deaf: member.deaf || false,
      mute: member.mute || false,
      pending: member.pending || false,
      permissions: member.permissions || '0',
      communication_disabled_until: member.communication_disabled_until || null
    } : null
  };
}

// Manage channels (create, edit, delete)
async function manageChannels(token: string, data: any) {
  const rest = new REST({ version: '10' }).setToken(token);
  
  let result;
  switch (data.action) {
    case 'create':
      const channel = await rest.post(Routes.guildChannels(data.guild_id), {
        body: {
          name: data.name,
          type: data.type || ChannelType.GuildText,
          topic: data.topic,
          nsfw: data.nsfw || false,
          bitrate: data.bitrate,
          user_limit: data.user_limit,
          parent_id: data.parent_id,
          permission_overwrites: data.permission_overwrites,
          position: data.position,
          rate_limit_per_user: data.rate_limit_per_user
        },
        reason: data.reason
      }) as any;
      result = {
        action: 'create',
        channel_id: channel.id,
        name: channel.name,
        type: channel.type,
        position: channel.position
      };
      break;
    case 'edit':
      await rest.patch(Routes.channel(data.channel_id), {
        body: {
          name: data.name,
          topic: data.topic,
          nsfw: data.nsfw,
          bitrate: data.bitrate,
          user_limit: data.user_limit,
          parent_id: data.parent_id,
          position: data.position,
          rate_limit_per_user: data.rate_limit_per_user
        },
        reason: data.reason
      });
      result = { action: 'edit', channel_id: data.channel_id };
      break;
    case 'delete':
      await rest.delete(Routes.channel(data.channel_id), {
        reason: data.reason
      });
      result = { action: 'delete', channel_id: data.channel_id };
      break;
  }

  return result;
}

export async function GET() {
  return NextResponse.json({
    service: 'Discord Integration',
    status: 'operational',
    features: [
      'Message Sending',
      'Slash Commands',
      'Server Management',
      'Role Management',
      'Rich Embeds',
      'Webhook Creation',
      'User Moderation',
      'Event Scheduling',
      'Channel Management'
    ],
    endpoints: {
      messaging: ['send_message', 'send_embed'],
      commands: ['create_slash_command'],
      server: ['get_guild_info', 'manage_channels', 'schedule_event'],
      moderation: ['moderate_user', 'manage_roles'],
      webhooks: ['create_webhook'],
      users: ['get_user_info']
    },
    bot_permissions: [
      'Send Messages',
      'Embed Links',
      'Attach Files',
      'Read Message History',
      'Use Slash Commands',
      'Manage Messages',
      'Manage Roles',
      'Manage Channels',
      'Ban Members',
      'Kick Members',
      'Moderate Members',
      'Manage Events',
      'Manage Webhooks'
    ]
  });
}