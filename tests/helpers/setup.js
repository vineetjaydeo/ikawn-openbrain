// Set test environment variables before any imports
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.SESSION_SECRET = 'test-secret';
process.env.R2_PUBLIC_URL = 'https://test-r2.example.com';
process.env.ANTHROPIC_API_KEY = 'test-key';
process.env.OPENAI_API_KEY = 'test-key';
process.env.INSTANCE_NAME = 'TestBrain';
