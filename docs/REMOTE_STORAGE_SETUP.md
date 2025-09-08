# Remote Storage Setup Guide

This guide covers setting up In-Memoria with remote persistent storage using PostgreSQL and Qdrant.

## Overview

In-Memoria now supports both local and remote persistent storage:

- **Local Storage** (Development): SQLite + Local Qdrant binary
- **Remote Storage** (Production): PostgreSQL + Qdrant (Docker/Cloud)

## Environment Detection

The system automatically detects your environment:

- **Development**: Local file system, no Docker/Kubernetes indicators
- **Production**: `NODE_ENV=production`, Docker, or Kubernetes environment
- **Test**: `NODE_ENV=test`

## Production Setup (Docker + Remote Storage)

### 1. PostgreSQL Setup

#### Option A: Managed PostgreSQL (Recommended)
Use a managed PostgreSQL service:
- AWS RDS
- Google Cloud SQL
- DigitalOcean Managed Database
- Heroku Postgres

#### Option B: Self-hosted PostgreSQL
```bash
# Docker PostgreSQL
docker run -d \
  --name postgres-inmemoria \
  -e POSTGRES_DB=in_memoria \
  -e POSTGRES_USER=inmemoria_user \
  -e POSTGRES_PASSWORD=secure_password \
  -p 5432:5432 \
  -v postgres_data:/var/lib/postgresql/data \
  postgres:15
```

### 2. Qdrant Setup

#### Option A: Qdrant Cloud (Managed)
Sign up at [cloud.qdrant.io](https://cloud.qdrant.io) and get your API key.

#### Option B: Self-hosted Qdrant (Docker)
```bash
# Docker Qdrant
docker run -d \
  --name qdrant-inmemoria \
  -p 6333:6333 \
  -p 6334:6334 \
  -v qdrant_storage:/qdrant/storage \
  qdrant/qdrant:latest
```

### 3. SSL Certificate Setup (For Self-hosted PostgreSQL)

If your PostgreSQL server requires SSL certificate verification (common with managed services or secure self-hosted setups), you can configure SSL support:

#### Steps:
1. **Obtain your PostgreSQL SSL certificate** (usually named `server-ca.pem`, `postgres.crt`, or similar)
2. **Create a certs directory** in your project:
   ```bash
   mkdir -p certs
   cp /path/to/your/postgres.crt certs/
   ```
3. **Update your environment variables** to enable SSL with certificate verification:
   ```bash
   POSTGRES_SSL_MODE=verify-full
   POSTGRES_SSL_CERT=/app/postgres.crt
   POSTGRES_SSL_CERT_PATH=./certs/postgres.crt
   ```
4. **Uncomment the certificate volume mount** in your `docker-compose.yml`:
   ```yaml
   volumes:
     - ${POSTGRES_SSL_CERT_PATH:-./certs/postgres.crt}:/app/postgres.crt:ro
   ```

#### SSL Modes Available:
- `disable` - No SSL
- `allow` - Try SSL, fallback to non-SSL
- `prefer` - Try SSL first, fallback to non-SSL (default)
- `require` - Require SSL, but don't verify certificate
- `verify-ca` - Require SSL and verify certificate authority
- `verify-full` - Require SSL and verify certificate + hostname

### 4. Environment Variables

Create a `.env` file or set environment variables:

```bash
# Environment
NODE_ENV=production

# PostgreSQL Configuration
POSTGRES_HOST=your-postgres-host
POSTGRES_PORT=5432
POSTGRES_DB=in_memoria
POSTGRES_USER=inmemoria_user
POSTGRES_PASSWORD=your-secure-password
POSTGRES_SSL=true
POSTGRES_POOL_SIZE=10

# SSL Configuration (for self-hosted PostgreSQL with SSL certificates)
# SSL Mode: disable, allow, prefer, require, verify-ca, verify-full
POSTGRES_SSL_MODE=verify-full
# Path to SSL certificate inside container
POSTGRES_SSL_CERT=/app/postgres.crt
# Local path to your certificate file (for Docker volume mounting)
POSTGRES_SSL_CERT_PATH=./certs/postgres.crt

# Qdrant Configuration
QDRANT_URL=http://your-qdrant-host:6333
QDRANT_API_KEY=your-qdrant-api-key  # Optional for self-hosted
QDRANT_COLLECTION=in-memoria
QDRANT_VECTOR_SIZE=1536

# OpenAI (for embeddings)
OPENAI_API_KEY=your-openai-api-key

# Optional: Force remote storage in any environment
IN_MEMORIA_STORAGE_MODE=remote
```

### 5. Docker Compose for Complete Stack

```yaml
# docker-compose.yml
version: '3.8'

services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: in_memoria
      POSTGRES_USER: inmemoria_user
      POSTGRES_PASSWORD: secure_password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - inmemoria

  qdrant:
    image: qdrant/qdrant:latest
    ports:
      - "6333:6333"
      - "6334:6334"
    volumes:
      - qdrant_storage:/qdrant/storage
    networks:
      - inmemoria

  inmemoria:
    build: .
    environment:
      NODE_ENV: production
      POSTGRES_HOST: postgres
      POSTGRES_PORT: 5432
      POSTGRES_DB: in_memoria
      POSTGRES_USER: inmemoria_user
      POSTGRES_PASSWORD: secure_password
      QDRANT_URL: http://qdrant:6333
      QDRANT_COLLECTION: in-memoria
      OPENAI_API_KEY: ${OPENAI_API_KEY}
    depends_on:
      - postgres
      - qdrant
    networks:
      - inmemoria
    volumes:
      - /path/to/your/code:/workspace

volumes:
  postgres_data:
  qdrant_storage:

networks:
  inmemoria:
```

## Development Setup (Local)

### Option 1: All Local (Default)
No setup required - uses SQLite and in-memory vectors.

### Option 2: Local with Qdrant Binary

1. Download Qdrant binary:
```bash
# Download and setup Qdrant locally
curl -L https://github.com/qdrant/qdrant/releases/latest/download/qdrant-x86_64-unknown-linux-gnu.tar.gz | tar xz
./qdrant --config-path ./qdrant-dev-config.yaml
```

2. Set environment:
```bash
IN_MEMORIA_VECTOR_TYPE=qdrant
QDRANT_URL=http://localhost:6333
```

### Option 3: Local with Remote Services
Use remote PostgreSQL/Qdrant but run In-Memoria locally:

```bash
# Force remote storage mode
IN_MEMORIA_STORAGE_MODE=remote
POSTGRES_HOST=your-remote-postgres
QDRANT_URL=http://your-remote-qdrant:6333
```

## Migration from Local to Remote

### 1. Export Existing Data
```bash
# Export current SQLite data
npx in-memoria export --output ./backup.json

# Or use the migration tool
npx in-memoria migrate export --format sql --output ./backup.sql
```

### 2. Setup Remote Storage
Follow the production setup steps above.

### 3. Import Data
```bash
# Set remote storage environment variables
export IN_MEMORIA_STORAGE_MODE=remote
export POSTGRES_HOST=your-postgres-host
# ... other variables

# Import data
npx in-memoria migrate import --input ./backup.json

# Or from SQL dump
npx in-memoria migrate import --format sql --input ./backup.sql
```

## Container Deployment

### Using the provided Docker configuration:

1. **Build the image:**
```bash
docker build -t in-memoria .
```

2. **Run with remote storage:**
```bash
docker run -d \
  --name in-memoria \
  -e NODE_ENV=production \
  -e POSTGRES_HOST=your-postgres \
  -e POSTGRES_USER=user \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=in_memoria \
  -e QDRANT_URL=http://your-qdrant:6333 \
  -e OPENAI_API_KEY=your-key \
  -v /path/to/code:/workspace \
  in-memoria
```

3. **Health check:**
```bash
docker exec in-memoria npx in-memoria health
```

## Kubernetes Deployment

### ConfigMap for configuration:
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: inmemoria-config
data:
  NODE_ENV: "production"
  POSTGRES_HOST: "postgres-service"
  POSTGRES_PORT: "5432"
  POSTGRES_DB: "in_memoria"
  POSTGRES_USER: "inmemoria_user"
  QDRANT_URL: "http://qdrant-service:6333"
  QDRANT_COLLECTION: "in-memoria"
```

### Secret for sensitive data:
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: inmemoria-secrets
type: Opaque
stringData:
  POSTGRES_PASSWORD: "your-secure-password"
  OPENAI_API_KEY: "your-openai-key"
  QDRANT_API_KEY: "your-qdrant-key"
```

### Deployment:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: inmemoria
spec:
  replicas: 1
  selector:
    matchLabels:
      app: inmemoria
  template:
    metadata:
      labels:
        app: inmemoria
    spec:
      containers:
      - name: inmemoria
        image: inmemoria:latest
        envFrom:
        - configMapRef:
            name: inmemoria-config
        - secretRef:
            name: inmemoria-secrets
        volumeMounts:
        - name: code-volume
          mountPath: /workspace
      volumes:
      - name: code-volume
        persistentVolumeClaim:
          claimName: code-pvc
```

## Troubleshooting

### Common Issues:

1. **Connection refused to PostgreSQL:**
   - Check host and port
   - Verify credentials
   - Ensure PostgreSQL is running
   - Check firewall settings

2. **Qdrant collection errors:**
   - Verify Qdrant is accessible
   - Check collection name
   - Validate vector dimensions

3. **Migration failures:**
   - Check disk space
   - Verify permissions
   - Run with `--debug` flag

### Health Checks:
```bash
# Check overall health
npx in-memoria health

# Check specific storage
npx in-memoria storage test --type postgresql
npx in-memoria storage test --type qdrant

# View configuration
npx in-memoria config show
```

### Debugging:
```bash
# Enable debug logging
IN_MEMORIA_LOG_LEVEL=debug npx in-memoria server

# Test connection only
npx in-memoria storage connect --test-only
```

## Performance Considerations

### PostgreSQL Tuning:
- Set appropriate `shared_buffers` (25% of RAM)
- Configure `work_mem` for large queries
- Enable connection pooling
- Use read replicas for heavy workloads

### Qdrant Optimization:
- Configure appropriate vector dimensions
- Use proper distance metrics (cosine for text)
- Set up proper indexing
- Monitor memory usage

### Network:
- Use internal networks for database connections
- Enable SSL for production
- Configure connection pooling
- Set appropriate timeouts

## Security

### Best Practices:
1. Use strong passwords
2. Enable SSL/TLS
3. Use secrets management (Kubernetes secrets, Docker secrets)
4. Network isolation
5. Regular backups
6. Monitor access logs

### Backup Strategy:
```bash
# Automated backup
npx in-memoria backup create --schedule daily

# Manual backup
npx in-memoria backup create --output s3://your-bucket/backup-$(date +%Y%m%d)
```
