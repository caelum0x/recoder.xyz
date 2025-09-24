import { prisma } from '../database/prisma';
import { EventEmitter } from 'events';

export interface MatchmakingRequest {
  userId: string;
  gameMode: string;
  skillLevel: number;
  preferredRegion?: string;
  maxWaitTime?: number;
  partySize?: number;
  partyMembers?: string[];
  preferences?: {
    skillRange?: number;
    mapPreferences?: string[];
    gameSettings?: any;
  };
}

export interface MatchResult {
  roomId: string;
  players: Array<{
    userId: string;
    team?: string;
    role: string;
  }>;
  estimatedMatchQuality: number;
}

export class MatchmakingService extends EventEmitter {
  private static instance: MatchmakingService;
  private matchmakingInterval!: NodeJS.Timeout;
  private readonly MATCHMAKING_INTERVAL = 60000; // 60 seconds
  private readonly MAX_SKILL_DIFFERENCE = 200; // ELO difference
  private readonly MATCH_QUALITY_THRESHOLD = 0.7;

  constructor() {
    super();
    // Temporarily disable auto-start to prevent database overload
    // this.startMatchmaking();
  }

  public static getInstance(): MatchmakingService {
    if (!MatchmakingService.instance) {
      MatchmakingService.instance = new MatchmakingService();
    }
    return MatchmakingService.instance;
  }

  /**
   * Add player to matchmaking queue
   */
  async joinQueue(request: MatchmakingRequest): Promise<string> {
    try {
      // Check if user is already in queue
      const existingQueue = await prisma.matchmakingQueue.findFirst({
        where: {
          userId: request.userId,
          status: 'waiting'
        }
      });

      if (existingQueue) {
        throw new Error('Player is already in matchmaking queue');
      }

      // Calculate estimated wait time
      const estimatedWaitTime = await this.calculateEstimatedWaitTime(request);

      // Create queue entry
      const queueEntry = await prisma.matchmakingQueue.create({
        data: {
          userId: request.userId,
          gameMode: request.gameMode,
          skillLevel: request.skillLevel,
          preferredRegion: request.preferredRegion,
          maxWaitTime: request.maxWaitTime || 300,
          partySize: request.partySize || 1,
          partyMembers: request.partyMembers || [],
          preferences: request.preferences || {},
          estimatedWaitTime,
          queuedAt: new Date()
        }
      });

      // Emit queue join event
      this.emit('playerJoined', {
        userId: request.userId,
        queueId: queueEntry.id,
        gameMode: request.gameMode,
        estimatedWaitTime
      });

      console.log(`Player ${request.userId} joined ${request.gameMode} queue`);
      return queueEntry.id;

    } catch (error) {
      console.error('Failed to join matchmaking queue:', error);
      throw error;
    }
  }

  /**
   * Remove player from matchmaking queue
   */
  async leaveQueue(userId: string): Promise<void> {
    try {
      const updated = await prisma.matchmakingQueue.updateMany({
        where: {
          userId,
          status: 'waiting'
        },
        data: {
          status: 'cancelled'
        }
      });

      if (updated.count > 0) {
        this.emit('playerLeft', { userId });
        console.log(`Player ${userId} left matchmaking queue`);
      }
    } catch (error) {
      console.error('Failed to leave matchmaking queue:', error);
      throw error;
    }
  }

  /**
   * Get current queue status for a user
   */
  async getQueueStatus(userId: string): Promise<any> {
    try {
      const queueEntry = await prisma.matchmakingQueue.findFirst({
        where: {
          userId,
          status: 'waiting'
        }
      });

      if (!queueEntry) {
        return { inQueue: false };
      }

      const waitTime = Date.now() - queueEntry.queuedAt.getTime();
      const position = await this.getQueuePosition(queueEntry.id);

      return {
        inQueue: true,
        queueId: queueEntry.id,
        gameMode: queueEntry.gameMode,
        waitTime: Math.floor(waitTime / 1000),
        estimatedWaitTime: queueEntry.estimatedWaitTime,
        position,
        status: queueEntry.status
      };
    } catch (error) {
      console.error('Failed to get queue status:', error);
      throw error;
    }
  }

  /**
   * Start the matchmaking process
   */
  private startMatchmaking(): void {
    this.matchmakingInterval = setInterval(async () => {
      await this.processMatchmaking();
    }, this.MATCHMAKING_INTERVAL);

    console.log('Matchmaking service started');
  }

  /**
   * Stop the matchmaking process
   */
  public stopMatchmaking(): void {
    if (this.matchmakingInterval) {
      clearInterval(this.matchmakingInterval);
      console.log('Matchmaking service stopped');
    }
  }

  /**
   * Main matchmaking processing logic
   */
  private async processMatchmaking(): Promise<void> {
    try {
      // Get all waiting players grouped by game mode
      const waitingPlayers = await prisma.matchmakingQueue.findMany({
        where: {
          status: 'waiting',
          queuedAt: {
            lte: new Date(Date.now() - 1000) // At least 1 second in queue
          }
        },
        include: {
          user: {
            select: {
              id: true,
              name: true
            }
          }
        },
        orderBy: {
          queuedAt: 'asc'
        }
      });

      if (waitingPlayers.length === 0) {
        return;
      }

      // Group players by game mode
      const playersByMode = this.groupPlayersByGameMode(waitingPlayers);

      // Process each game mode
      for (const [gameMode, players] of Object.entries(playersByMode)) {
        await this.processGameMode(gameMode, players);
      }

      // Clean up expired queue entries
      await this.cleanupExpiredQueue();

    } catch (error) {
      console.error('Matchmaking processing error:', error);
    }
  }

  /**
   * Process matchmaking for a specific game mode
   */
  private async processGameMode(gameMode: string, players: any[]): Promise<void> {
    if (players.length < 2) {
      return; // Need at least 2 players
    }

    // Different matchmaking strategies based on game mode
    let matches: any[] = [];

    switch (gameMode) {
      case 'deathmatch':
        matches = await this.createDeathmatchMatches(players);
        break;
      case 'team':
        matches = await this.createTeamMatches(players);
        break;
      case 'cooperative':
        matches = await this.createCooperativeMatches(players);
        break;
      case 'battle_royale':
        matches = await this.createBattleRoyaleMatches(players);
        break;
      default:
        matches = await this.createGenericMatches(players);
        break;
    }

    // Create game rooms for successful matches
    for (const match of matches) {
      await this.createGameRoom(match, gameMode);
    }
  }

  /**
   * Create deathmatch matches (4-10 players)
   */
  private async createDeathmatchMatches(players: any[]): Promise<any[]> {
    const matches: any[] = [];
    const minPlayers = 4;
    const maxPlayers = 10;

    while (players.length >= minPlayers) {
      const matchPlayers: any[] = [];
      const sortedPlayers = this.sortPlayersBySkill(players);

      // Take players with similar skill levels
      for (let i = 0; i < Math.min(maxPlayers, players.length); i++) {
        const player = sortedPlayers[i];
        
        if (matchPlayers.length === 0 || 
            Math.abs(player.skillLevel - matchPlayers[0].skillLevel) <= this.MAX_SKILL_DIFFERENCE) {
          matchPlayers.push(player);
          players.splice(players.indexOf(player), 1);
        }
      }

      if (matchPlayers.length >= minPlayers) {
        matches.push({
          players: matchPlayers,
          matchQuality: this.calculateMatchQuality(matchPlayers)
        });
      } else {
        // Put players back if we can't make a good match
        players.push(...matchPlayers);
        break;
      }
    }

    return matches;
  }

  /**
   * Create team matches (2v2, 3v3, 5v5)
   */
  private async createTeamMatches(players: any[]): Promise<any[]> {
    const matches: any[] = [];
    const teamSizes = [2, 3, 5]; // Supported team sizes
    
    for (const teamSize of teamSizes) {
      const requiredPlayers = teamSize * 2;
      
      while (players.length >= requiredPlayers) {
        const matchPlayers = players.splice(0, requiredPlayers);
        const sortedPlayers = this.sortPlayersBySkill(matchPlayers);
        
        // Balance teams by alternating skill levels
        const team1: any[] = [];
        const team2: any[] = [];
        
        for (let i = 0; i < sortedPlayers.length; i++) {
          if (i % 2 === 0) {
            team1.push({ ...sortedPlayers[i], team: 'team1' });
          } else {
            team2.push({ ...sortedPlayers[i], team: 'team2' });
          }
        }
        
        const allPlayers = [...team1, ...team2];
        matches.push({
          players: allPlayers,
          matchQuality: this.calculateTeamMatchQuality(team1, team2),
          teamSize
        });
        
        break; // Only create one match per team size per cycle
      }
    }

    return matches;
  }

  /**
   * Create cooperative matches (2-6 players)
   */
  private async createCooperativeMatches(players: any[]): Promise<any[]> {
    const matches: any[] = [];
    const minPlayers = 2;
    const maxPlayers = 6;

    while (players.length >= minPlayers) {
      const matchPlayers = players.splice(0, Math.min(maxPlayers, players.length));
      
      matches.push({
        players: matchPlayers.map(p => ({ ...p, team: 'coop' })),
        matchQuality: this.calculateMatchQuality(matchPlayers)
      });
    }

    return matches;
  }

  /**
   * Create battle royale matches (20-100 players)
   */
  private async createBattleRoyaleMatches(players: any[]): Promise<any[]> {
    const matches: any[] = [];
    const minPlayers = 20;
    const maxPlayers = 100;

    if (players.length >= minPlayers) {
      const matchPlayers = players.splice(0, Math.min(maxPlayers, players.length));
      
      matches.push({
        players: matchPlayers,
        matchQuality: this.calculateMatchQuality(matchPlayers)
      });
    }

    return matches;
  }

  /**
   * Create generic matches
   */
  private async createGenericMatches(players: any[]): Promise<any[]> {
    return this.createDeathmatchMatches(players); // Fallback to deathmatch
  }

  /**
   * Create a game room from a successful match
   */
  private async createGameRoom(match: any, gameMode: string): Promise<void> {
    try {
      const hostPlayer = match.players[0];
      const maxPlayers = match.players.length;
      
      // Create the game room
      const gameRoom = await prisma.gameRoom.create({
        data: {
          name: `${gameMode.charAt(0).toUpperCase() + gameMode.slice(1)} Match`,
          gameMode,
          maxPlayers,
          currentPlayers: match.players.length,
          hostId: hostPlayer.userId,
          status: 'waiting',
          gameSettings: {
            matchQuality: match.matchQuality,
            teamSize: match.teamSize || null,
            autoStart: true
          },
          serverRegion: hostPlayer.preferredRegion || 'us-east'
        }
      });

      // Add all players to the room
      const roomPlayers = match.players.map((player: any) => ({
        userId: player.userId,
        roomId: gameRoom.id,
        team: player.team || null,
        role: player.userId === hostPlayer.userId ? 'host' : 'player',
        status: 'ready'
      }));

      await prisma.gameRoomPlayer.createMany({
        data: roomPlayers
      });

      // Update matchmaking queue entries
      const playerIds = match.players.map((p: any) => p.userId);
      await prisma.matchmakingQueue.updateMany({
        where: {
          userId: { in: playerIds },
          status: 'waiting'
        },
        data: {
          status: 'matched',
          matchedAt: new Date(),
          roomId: gameRoom.id
        }
      });

      // Emit match found event
      this.emit('matchFound', {
        roomId: gameRoom.id,
        players: match.players,
        gameMode,
        matchQuality: match.matchQuality
      });

      console.log(`Created ${gameMode} match with ${match.players.length} players (Room: ${gameRoom.id})`);

    } catch (error) {
      console.error('Failed to create game room:', error);
    }
  }

  /**
   * Helper methods
   */
  private groupPlayersByGameMode(players: any[]): Record<string, any[]> {
    return players.reduce((groups, player) => {
      const mode = player.gameMode;
      if (!groups[mode]) {
        groups[mode] = [];
      }
      groups[mode].push(player);
      return groups;
    }, {} as Record<string, any[]>);
  }

  private sortPlayersBySkill(players: any[]): any[] {
    return [...players].sort((a, b) => b.skillLevel - a.skillLevel);
  }

  private calculateMatchQuality(players: any[]): number {
    if (players.length < 2) return 0;

    const skillLevels = players.map(p => p.skillLevel);
    const avgSkill = skillLevels.reduce((sum, skill) => sum + skill, 0) / skillLevels.length;
    const variance = skillLevels.reduce((sum, skill) => sum + Math.pow(skill - avgSkill, 2), 0) / skillLevels.length;
    const standardDeviation = Math.sqrt(variance);

    // Lower standard deviation = higher match quality
    const normalizedQuality = Math.max(0, 1 - (standardDeviation / 500));
    return Math.min(1, normalizedQuality);
  }

  private calculateTeamMatchQuality(team1: any[], team2: any[]): number {
    const team1Avg = team1.reduce((sum, p) => sum + p.skillLevel, 0) / team1.length;
    const team2Avg = team2.reduce((sum, p) => sum + p.skillLevel, 0) / team2.length;
    
    const teamDifference = Math.abs(team1Avg - team2Avg);
    const normalizedQuality = Math.max(0, 1 - (teamDifference / 300));
    
    return Math.min(1, normalizedQuality);
  }

  private async calculateEstimatedWaitTime(request: MatchmakingRequest): Promise<number> {
    // Get average wait time for similar skill level and game mode
    const similarMatches = await prisma.matchmakingQueue.findMany({
      where: {
        gameMode: request.gameMode,
        skillLevel: {
          gte: request.skillLevel - 100,
          lte: request.skillLevel + 100
        },
        status: 'matched',
        matchedAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        }
      },
      select: {
        queuedAt: true,
        matchedAt: true
      }
    });

    if (similarMatches.length === 0) {
      return 60; // Default 1 minute
    }

    const avgWaitTime = similarMatches.reduce((sum, match) => {
      const waitTime = match.matchedAt!.getTime() - match.queuedAt.getTime();
      return sum + waitTime;
    }, 0) / similarMatches.length;

    return Math.ceil(avgWaitTime / 1000); // Convert to seconds
  }

  private async getQueuePosition(queueId: string): Promise<number> {
    const queueEntry = await prisma.matchmakingQueue.findUnique({
      where: { id: queueId }
    });

    if (!queueEntry) return -1;

    const earlierEntries = await prisma.matchmakingQueue.count({
      where: {
        gameMode: queueEntry.gameMode,
        status: 'waiting',
        queuedAt: {
          lt: queueEntry.queuedAt
        }
      }
    });

    return earlierEntries + 1;
  }

  private async cleanupExpiredQueue(): Promise<void> {
    const expiredTime = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes

    await prisma.matchmakingQueue.updateMany({
      where: {
        status: 'waiting',
        queuedAt: {
          lt: expiredTime
        }
      },
      data: {
        status: 'expired',
        expiredAt: new Date()
      }
    });
  }
}

// Export singleton instance
export const matchmakingService = MatchmakingService.getInstance();