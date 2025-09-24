import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { rateLimit } from 'express-rate-limit';
import { body, query, param, validationResult } from 'express-validator';
import { prisma } from '../database/prisma';
import { matchmakingService } from '../services/matchmaking';

const router = Router();

// Rate limiting
const matchmakingRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // Limit each IP to 30 requests per windowMs
  message: 'Too many matchmaking requests, please try again later.'
});

// Validation middleware
const validateRequest = (validations: any[]) => {
  return async (req: Request, res: Response, next: any) => {
    await Promise.all(validations.map(validation => validation.run(req)));

    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }

    res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  };
};

// Join matchmaking queue
const joinQueueSchema = [
  body('gameMode').isString().notEmpty().withMessage('Game mode is required'),
  body('skillLevel').optional().isInt({ min: 0, max: 5000 }).withMessage('Skill level must be between 0-5000'),
  body('preferredRegion').optional().isString().isIn(['us-east', 'us-west', 'eu-west', 'eu-east', 'asia-pacific']),
  body('maxWaitTime').optional().isInt({ min: 30, max: 900 }).withMessage('Max wait time must be between 30-900 seconds'),
  body('partySize').optional().isInt({ min: 1, max: 10 }).withMessage('Party size must be between 1-10'),
  body('partyMembers').optional().isArray().withMessage('Party members must be an array'),
  body('preferences').optional().isObject().withMessage('Preferences must be an object')
];

router.post('/queue/join', authenticate, matchmakingRateLimit, validateRequest(joinQueueSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.userId;
    const {
      gameMode,
      skillLevel = 1000,
      preferredRegion,
      maxWaitTime = 300,
      partySize = 1,
      partyMembers = [],
      preferences = {}
    } = req.body;

    const request = {
      userId,
      gameMode,
      skillLevel,
      preferredRegion,
      maxWaitTime,
      partySize,
      partyMembers,
      preferences
    };

    const queueId = await matchmakingService.joinQueue(request);

    res.json({
      success: true,
      data: {
        queueId,
        gameMode,
        estimatedWaitTime: maxWaitTime,
        message: 'Successfully joined matchmaking queue'
      }
    });

  } catch (error) {
    console.error('Join queue error:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to join matchmaking queue'
    });
  }
});

// Leave matchmaking queue
router.post('/queue/leave', authenticate, matchmakingRateLimit, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.userId;

    await matchmakingService.leaveQueue(userId);

    res.json({
      success: true,
      data: {
        message: 'Successfully left matchmaking queue'
      }
    });

  } catch (error) {
    console.error('Leave queue error:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to leave matchmaking queue'
    });
  }
});

// Get queue status
router.get('/queue/status', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.userId;

    const status = await matchmakingService.getQueueStatus(userId);

    res.json({
      success: true,
      data: status
    });

  } catch (error) {
    console.error('Queue status error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get queue status'
    });
  }
});

// Get available game rooms
const getRoomsSchema = [
  query('gameMode').optional().isString(),
  query('region').optional().isString(),
  query('status').optional().isString().isIn(['waiting', 'active', 'finished']),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt()
];

router.get('/rooms', authenticate, validateRequest(getRoomsSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      gameMode,
      region,
      status = 'waiting',
      page = 1,
      limit = 20
    } = req.query as any;

    const where: any = {
      status,
      isPrivate: false // Only show public rooms
    };

    if (gameMode) where.gameMode = gameMode;
    if (region) where.serverRegion = region;

    const [rooms, total] = await Promise.all([
      prisma.gameRoom.findMany({
        where,
        include: {
          host: {
            select: { id: true, name: true }
          },
          players: {
            select: {
              id: true,
              userId: true,
              status: true,
              team: true,
              user: {
                select: { name: true }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.gameRoom.count({ where })
    ]);

    res.json({
      success: true,
      data: {
        rooms,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('Get rooms error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get game rooms'
    });
  }
});

// Create game room
const createRoomSchema = [
  body('name').isString().notEmpty().withMessage('Room name is required'),
  body('gameMode').isString().notEmpty().withMessage('Game mode is required'),
  body('maxPlayers').isInt({ min: 2, max: 100 }).withMessage('Max players must be between 2-100'),
  body('isPrivate').optional().isBoolean(),
  body('password').optional().isString(),
  body('gameSettings').optional().isObject(),
  body('mapName').optional().isString(),
  body('serverRegion').optional().isString().isIn(['us-east', 'us-west', 'eu-west', 'eu-east', 'asia-pacific'])
];

router.post('/rooms', authenticate, matchmakingRateLimit, validateRequest(createRoomSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.userId;
    const {
      name,
      gameMode,
      maxPlayers,
      isPrivate = false,
      password,
      gameSettings = {},
      mapName,
      serverRegion = 'us-east'
    } = req.body;

    // Check if user already has an active room
    const existingRoom = await prisma.gameRoom.findFirst({
      where: {
        hostId: userId,
        status: { in: ['waiting', 'active'] }
      }
    });

    if (existingRoom) {
      res.status(400).json({
        success: false,
        error: 'You already have an active game room'
      });
      return;
    }

    const room = await prisma.gameRoom.create({
      data: {
        name,
        gameMode,
        maxPlayers,
        currentPlayers: 1, // Host counts as a player
        isPrivate,
        password,
        hostId: userId,
        gameSettings,
        mapName,
        serverRegion,
        status: 'waiting'
      },
      include: {
        host: {
          select: { id: true, name: true }
        }
      }
    });

    // Add host as a player
    await prisma.gameRoomPlayer.create({
      data: {
        userId,
        roomId: room.id,
        role: 'host',
        status: 'ready'
      }
    });

    res.json({
      success: true,
      data: {
        room: {
          id: room.id,
          name: room.name,
          gameMode: room.gameMode,
          maxPlayers: room.maxPlayers,
          currentPlayers: room.currentPlayers,
          isPrivate: room.isPrivate,
          host: room.host,
          serverRegion: room.serverRegion,
          createdAt: room.createdAt
        }
      }
    });

  } catch (error) {
    console.error('Create room error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create game room'
    });
  }
});

// Get room details
router.get('/rooms/:roomId', authenticate, validateRequest([
  param('roomId').isString().notEmpty()
]), async (req: Request, res: Response): Promise<void> => {
  try {
    const { roomId } = req.params;

    const room = await prisma.gameRoom.findUnique({
      where: { id: roomId },
      include: {
        host: {
          select: { id: true, name: true }
        },
        players: {
          include: {
            user: {
              select: { id: true, name: true }
            }
          }
        }
      }
    });

    if (!room) {
      res.status(404).json({
        success: false,
        error: 'Room not found'
      });
      return;
    }

    res.json({
      success: true,
      data: { room }
    });

  } catch (error) {
    console.error('Get room error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get room details'
    });
  }
});

// Join room
const joinRoomSchema = [
  body('password').optional().isString()
];

router.post('/rooms/:roomId/join', authenticate, validateRequest([
  param('roomId').isString().notEmpty(),
  ...joinRoomSchema
]), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { roomId } = req.params;
    const { password } = req.body;

    const room = await prisma.gameRoom.findUnique({
      where: { id: roomId },
      include: {
        players: true
      }
    });

    if (!room) {
      res.status(404).json({
        success: false,
        error: 'Room not found'
      });
      return;
    }

    if (room.status !== 'waiting') {
      res.status(400).json({
        success: false,
        error: 'Room is not accepting new players'
      });
      return;
    }

    if (room.currentPlayers >= room.maxPlayers) {
      res.status(400).json({
        success: false,
        error: 'Room is full'
      });
      return;
    }

    if (room.isPrivate && room.password !== password) {
      res.status(400).json({
        success: false,
        error: 'Invalid password'
      });
      return;
    }

    // Check if user is already in room
    const existingPlayer = room.players.find(p => p.userId === userId);
    if (existingPlayer) {
      res.status(400).json({
        success: false,
        error: 'You are already in this room'
      });
      return;
    }

    // Add player to room
    await prisma.gameRoomPlayer.create({
      data: {
        userId,
        roomId,
        role: 'player',
        status: 'connected'
      }
    });

    // Update room player count
    await prisma.gameRoom.update({
      where: { id: roomId },
      data: {
        currentPlayers: { increment: 1 }
      }
    });

    res.json({
      success: true,
      data: {
        message: 'Successfully joined room'
      }
    });

  } catch (error) {
    console.error('Join room error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to join room'
    });
  }
});

// Leave room
router.post('/rooms/:roomId/leave', authenticate, validateRequest([
  param('roomId').isString().notEmpty()
]), async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.userId;
    const { roomId } = req.params;

    const room = await prisma.gameRoom.findUnique({
      where: { id: roomId }
    });

    if (!room) {
      res.status(404).json({
        success: false,
        error: 'Room not found'
      });
      return;
    }

    // Remove player from room
    const deletedPlayer = await prisma.gameRoomPlayer.deleteMany({
      where: {
        userId,
        roomId
      }
    });

    if (deletedPlayer.count === 0) {
      res.status(400).json({
        success: false,
        error: 'You are not in this room'
      });
      return;
    }

    // Update room player count
    await prisma.gameRoom.update({
      where: { id: roomId },
      data: {
        currentPlayers: { decrement: 1 }
      }
    });

    // If host left and there are other players, assign new host
    if (room.hostId === userId) {
      const remainingPlayers = await prisma.gameRoomPlayer.findFirst({
        where: { roomId },
        orderBy: { joinedAt: 'asc' }
      });

      if (remainingPlayers) {
        await prisma.gameRoom.update({
          where: { id: roomId },
          data: { hostId: remainingPlayers.userId }
        });

        await prisma.gameRoomPlayer.update({
          where: { id: remainingPlayers.id },
          data: { role: 'host' }
        });
      } else {
        // No players left, close room
        await prisma.gameRoom.update({
          where: { id: roomId },
          data: { status: 'finished', endedAt: new Date() }
        });
      }
    }

    res.json({
      success: true,
      data: {
        message: 'Successfully left room'
      }
    });

  } catch (error) {
    console.error('Leave room error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to leave room'
    });
  }
});

// Get match history
const getMatchHistorySchema = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('gameMode').optional().isString(),
  query('matchType').optional().isString().isIn(['ranked', 'casual', 'tournament'])
];

router.get('/matches/history', authenticate, validateRequest(getMatchHistorySchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.userId;
    const {
      page = 1,
      limit = 20,
      gameMode,
      matchType
    } = req.query as any;

    const where: any = {
      players: {
        some: { userId }
      },
      status: 'finished'
    };

    if (gameMode) where.gameMode = gameMode;
    if (matchType) where.matchType = matchType;

    const [matches, total] = await Promise.all([
      prisma.gameMatch.findMany({
        where,
        include: {
          players: {
            include: {
              user: {
                select: { id: true, name: true }
              }
            }
          }
        },
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.gameMatch.count({ where })
    ]);

    res.json({
      success: true,
      data: {
        matches,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('Get match history error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get match history'
    });
  }
});

// Get matchmaking statistics
router.get('/stats', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.userId;

    // Get user's match statistics
    const [totalMatches, wonMatches, totalKills, totalDeaths] = await Promise.all([
      prisma.gameMatchPlayer.count({
        where: { userId }
      }),
      prisma.gameMatchPlayer.count({
        where: { 
          userId,
          finalPosition: 1
        }
      }),
      prisma.gameMatchPlayer.aggregate({
        where: { userId },
        _sum: { kills: true }
      }),
      prisma.gameMatchPlayer.aggregate({
        where: { userId },
        _sum: { deaths: true }
      })
    ]);

    // Get current skill rating
    const latestMatch = await prisma.gameMatchPlayer.findFirst({
      where: { userId },
      orderBy: { match: { startedAt: 'desc' } },
      select: { skillAfter: true }
    });

    // Get favorite game mode
    const gameModeStats = await prisma.gameMatch.groupBy({
      by: ['gameMode'],
      where: {
        players: {
          some: { userId: userId }
        }
      },
      _count: { gameMode: true }
    });

    const stats = {
      totalMatches,
      wonMatches,
      winRate: totalMatches > 0 ? (wonMatches / totalMatches * 100).toFixed(1) : '0.0',
      totalKills: totalKills._sum.kills || 0,
      totalDeaths: totalDeaths._sum.deaths || 0,
      kdr: (totalDeaths._sum.deaths || 0) > 0 ? 
        ((totalKills._sum.kills || 0) / (totalDeaths._sum.deaths || 0)).toFixed(2) : '0.00',
      currentSkill: latestMatch?.skillAfter || 1000,
      matchesThisWeek: 0, // Could be calculated with date filtering
      averageMatchDuration: 0 // Could be calculated from match data
    };

    res.json({
      success: true,
      data: { stats }
    });

  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get matchmaking statistics'
    });
  }
});

export default router;
// CommonJS compatibility
module.exports = router;
