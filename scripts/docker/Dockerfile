# Multi-stage build for Koala Blog standalone mode
ARG NODE_VERSION=20

# Stage 1: Base image with pnpm
FROM node:${NODE_VERSION}-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.14.0 --activate
WORKDIR /app

# Stage 2: Dependencies installation
FROM base AS dependencies
# Copy package files
COPY package.json pnpm-lock.yaml ./
COPY .npmrc ./

# Install all dependencies (including dev dependencies for build)
RUN pnpm install --frozen-lockfile

# Stage 3: Build application
FROM dependencies AS build

# Copy source code
COPY . .

# Set build environment for standalone mode
ENV DATA_SOURCE=sqlite
ENV DEPLOY_MODE=standalone
ENV NODE_ENV=production

# Initialize database and build application
RUN pnpm run sqlite:init && \
    pnpm run build

# Stage 4: Production dependencies only
FROM base AS production-deps
COPY package.json pnpm-lock.yaml ./
COPY .npmrc ./

# Install only production dependencies
RUN pnpm install --frozen-lockfile --prod

# Stage 5: Runtime image
FROM node:${NODE_VERSION}-alpine AS runtime

# Install required system dependencies
RUN apk add --no-cache \
    sqlite \
    dumb-init \
    && addgroup -g 1001 -S nodejs \
    && adduser -S astro -u 1001

# Set working directory
WORKDIR /app

# Copy built application and dependencies
COPY --from=build --chown=astro:nodejs /app/dist ./dist
COPY --from=production-deps --chown=astro:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=astro:nodejs /app/package.json ./package.json

# Copy database and migrations
COPY --from=build --chown=astro:nodejs /app/local.db ./local.db
COPY --from=build --chown=astro:nodejs /app/migrations ./migrations

# Copy additional required files
COPY --from=build --chown=astro:nodejs /app/drizzle.config.ts ./drizzle.config.ts

# Create directories for runtime data
RUN mkdir -p /app/data /app/uploads \
    && chown -R astro:nodejs /app/data /app/uploads

# Set environment variables
ENV NODE_ENV=production
ENV DATA_SOURCE=sqlite
ENV DEPLOY_MODE=standalone
ENV SQLITE_URL=/app/data/koala.db
ENV HOST=0.0.0.0
ENV PORT=4321

# Expose port
EXPOSE 4321

# Switch to non-root user
USER astro

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "fetch('http://localhost:4321/api/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "./dist/server/entry.mjs"]