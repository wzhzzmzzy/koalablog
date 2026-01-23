# Docker Files Organization

All Docker-related files have been organized into the `scripts/docker/` directory to keep the project root clean.

## 📁 Directory Structure

```
scripts/docker/
├── Dockerfile              # Production build
├── Dockerfile.dev          # Development build
├── docker-compose.yml      # Production compose
├── docker-compose.dev.yml  # Development compose
├── DOCKER.md               # Detailed documentation
├── README.md               # This file
└── config/
    └── nginx/
        ├── nginx.conf      # Nginx configuration
        └── ssl/            # SSL certificates (add your own)
```

## 🚀 Quick Commands

All commands should be run from the **project root** directory:

### Using NPM Scripts (Recommended)
```bash
# Build and run
pnpm run docker:build
pnpm run compose:up

# Development mode
pnpm run compose:dev

# Production with Nginx
pnpm run compose:prod
```

### Using Docker Compose Directly
```bash
# From project root
docker-compose -f scripts/docker/docker-compose.yml up -d

# Or navigate to docker directory
cd scripts/docker
docker-compose up -d
```

### Using Deployment Script
```bash
# From project root
./scripts/docker-deploy.sh build
./scripts/docker-deploy.sh run
```

## 📖 Full Documentation

See [DOCKER.md](./DOCKER.md) for complete documentation including:
- Detailed deployment options
- Configuration examples
- Security considerations
- Troubleshooting guide
- Performance optimization

## 🔄 Migration Notes

If you have existing Docker containers or images, you may need to:

1. **Stop existing containers:**
   ```bash
   docker stop koalablog-app
   docker rm koalablog-app
   ```

2. **Remove old images:**
   ```bash
   docker rmi koalablog:latest
   ```

3. **Rebuild with new structure:**
   ```bash
   pnpm run docker:build
   pnpm run compose:up
   ```

## ⚠️ Important Notes

- All Docker commands assume you're in the **project root** directory
- The build context is set to the project root (`../../` from docker files)
- Configuration files use relative paths from the docker directory
- Volume mounts are configured for the new structure
