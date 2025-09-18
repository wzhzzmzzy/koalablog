# Koala Blog Docker 部署指南

本指南介绍如何将Koala Blog的standalone模式部署为Docker容器。

## 📋 目录

- [快速开始](#快速开始)
- [构建选项](#构建选项)
- [部署方式](#部署方式)
- [配置选项](#配置选项)
- [数据持久化](#数据持久化)
- [监控和维护](#监控和维护)
- [故障排除](#故障排除)

## 🚀 快速开始

### 使用Docker Compose (推荐)

```bash
# 启动应用 (仅应用服务)
pnpm run compose:up

# 启动应用 + Nginx代理 (生产环境)
pnpm run compose:prod

# 开发模式
pnpm run compose:dev

# 或者直接使用docker-compose
cd scripts/docker
docker-compose up -d
```

### 使用便捷脚本

```bash
# 构建和运行
./scripts/docker-deploy.sh build
./scripts/docker-deploy.sh run

# 查看日志
./scripts/docker-deploy.sh logs

# 健康检查
./scripts/docker-deploy.sh health
```

## 🏗️ 构建选项

### 1. 生产环境构建

```bash
# 使用npm脚本
pnpm run docker:build

# 直接使用Docker
docker build -t koalablog:latest .

# 使用脚本
./scripts/docker-deploy.sh build --tag v1.0.0
```

### 2. 开发环境构建

```bash
# 使用npm脚本
pnpm run docker:build:dev

# 直接使用Docker
docker build -f Dockerfile.dev -t koalablog:dev .
```

## 🚢 部署方式

### 方式一：Docker Run

```bash
# 生产模式
docker run -d \
  --name koalablog-app \
  -p 4321:4321 \
  -v koalablog-data:/app/data \
  -v koalablog-uploads:/app/uploads \
  -e NODE_ENV=production \
  --restart unless-stopped \
  koalablog:latest

# 开发模式
docker run -d \
  --name koalablog-dev \
  -p 4321:4321 \
  -v $(pwd):/app \
  -v /app/node_modules \
  koalablog:dev
```

### 方式二：Docker Compose

#### 基础配置 (docker-compose.yml)
```yaml
services:
  koalablog:
    build: .
    ports:
      - "4321:4321"
    volumes:
      - koalablog-data:/app/data
      - koalablog-uploads:/app/uploads
    environment:
      - NODE_ENV=production
      - DATA_SOURCE=sqlite
      - DEPLOY_MODE=standalone
```

#### 生产配置 (包含Nginx)
```bash
# 启动完整生产环境
docker-compose --profile production up -d
```

### 方式三：便捷脚本

```bash
# 构建镜像
./scripts/docker-deploy.sh build

# 运行容器
./scripts/docker-deploy.sh run --port 8080

# 重启容器
./scripts/docker-deploy.sh restart

# 停止容器
./scripts/docker-deploy.sh stop
```

## ⚙️ 配置选项

### 环境变量

| 变量名 | 默认值 | 描述 |
|--------|--------|------|
| `NODE_ENV` | production | 运行环境 |
| `DATA_SOURCE` | sqlite | 数据源类型 |
| `DEPLOY_MODE` | standalone | 部署模式 |
| `SQLITE_URL` | /app/data/koala.db | SQLite数据库路径 |
| `HOST` | 0.0.0.0 | 监听地址 |
| `PORT` | 4321 | 监听端口 |

### 自定义配置示例

```bash
docker run -d \
  --name koalablog-custom \
  -p 8080:4321 \
  -v /host/data:/app/data \
  -e NODE_ENV=production \
  -e SQLITE_URL=/app/data/custom.db \
  koalablog:latest
```

## 💾 数据持久化

### 数据卷说明

- **koalablog-data**: 数据库和应用数据
- **koalablog-uploads**: 用户上传的文件

### 备份数据

```bash
# 使用脚本备份
./scripts/docker-deploy.sh backup

# 手动备份
docker run --rm \
  -v koalablog-data:/data \
  -v $(pwd)/backup:/backup \
  alpine cp -r /data /backup/
```

### 恢复数据

```bash
# 使用脚本恢复
./scripts/docker-deploy.sh restore ./backups/20241201_120000

# 手动恢复
docker run --rm \
  -v koalablog-data:/data \
  -v $(pwd)/backup:/backup \
  alpine cp -r /backup/data/* /data/
```

## 📊 监控和维护

### 健康检查

```bash
# 使用脚本检查
./scripts/docker-deploy.sh health

# 直接访问健康端点
curl http://localhost:4321/api/health

# 查看容器状态
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

### 日志查看

```bash
# 使用脚本查看日志
./scripts/docker-deploy.sh logs

# 直接查看Docker日志
docker logs -f koalablog-app

# Docker Compose日志
pnpm run compose:logs
```

### 性能监控

```bash
# 容器资源使用
docker stats koalablog-app

# 系统资源
docker system df
docker system events
```

## 🔧 故障排除

### 常见问题

#### 1. 容器启动失败

```bash
# 查看详细日志
docker logs koalablog-app

# 检查端口占用
sudo netstat -tlnp | grep :4321

# 检查卷挂载
docker volume ls
docker volume inspect koalablog-data
```

#### 2. 数据库连接问题

```bash
# 检查数据库文件
docker exec -it koalablog-app ls -la /app/data/

# 手动初始化数据库
docker exec -it koalablog-app pnpm run sqlite:init
```

#### 3. 权限问题

```bash
# 检查文件权限
docker exec -it koalablog-app ls -la /app/

# 修复权限
docker exec -it koalablog-app chown -R astro:nodejs /app/data/
```

### 调试模式

```bash
# 进入容器调试
docker exec -it koalablog-app sh

# 使用调试镜像
docker run -it --rm koalablog:latest sh
```

## 🚀 生产部署最佳实践

### 1. 使用反向代理

推荐使用Nginx作为反向代理，提供SSL终端、静态文件服务和负载均衡。

```bash
# 启动包含Nginx的完整生产环境
docker-compose --profile production up -d
```

### 2. 资源限制

```yaml
services:
  koalablog:
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '0.5'
        reservations:
          memory: 256M
          cpus: '0.25'
```

### 3. 安全配置

```bash
# 创建专用网络
docker network create koalablog-network

# 限制容器权限
docker run --security-opt no-new-privileges koalablog:latest
```

### 4. 监控告警

使用Docker的健康检查功能：

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:4321/api/health"]
  interval: 30s
  timeout: 10s
  retries: 3
```

## 📚 脚本命令参考

```bash
# 构建相关
./scripts/docker-deploy.sh build [--tag TAG]
./scripts/docker-deploy.sh build --tag v1.0.0

# 运行相关
./scripts/docker-deploy.sh run [--port PORT] [--env ENV]
./scripts/docker-deploy.sh run --port 8080 --env dev

# 维护相关
./scripts/docker-deploy.sh stop
./scripts/docker-deploy.sh restart
./scripts/docker-deploy.sh logs
./scripts/docker-deploy.sh health

# 数据相关
./scripts/docker-deploy.sh backup
./scripts/docker-deploy.sh restore /path/to/backup

# 清理相关
./scripts/docker-deploy.sh clean
```

## 🔗 相关链接

- [Docker官方文档](https://docs.docker.com/)
- [Docker Compose文档](https://docs.docker.com/compose/)
- [Astro部署指南](https://docs.astro.build/en/guides/deploy/)
- [项目主README](./README.md)