export interface DatabaseConfig {
	connectionString: string;
	poolConfig?: {
		max?: number;
		idleTimeoutMillis?: number;
		connectionTimeoutMillis?: number;
	};
}
