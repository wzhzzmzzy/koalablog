#!/bin/bash

# Docker deployment script for Koala Blog
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
IMAGE_NAME="koalablog"
CONTAINER_NAME="koalablog-app"
PORT=${PORT:-4321}
ENV=${ENV:-production}

print_status() {
    echo -e "${2}${1}${NC}"
}

show_help() {
    echo "Usage: $0 [COMMAND] [OPTIONS]"
    echo ""
    echo "Commands:"
    echo "  build      Build the Docker image"
    echo "  run        Run the container"
    echo "  stop       Stop the container"
    echo "  restart    Restart the container"
    echo "  logs       Show container logs"
    echo "  clean      Remove container and image"
    echo "  health     Check container health"
    echo "  backup     Backup persistent data"
    echo "  restore    Restore from backup"
    echo ""
    echo "Options:"
    echo "  --port PORT     Port to expose (default: 4321)"
    echo "  --env ENV       Environment (dev/production, default: production)"
    echo "  --tag TAG       Docker image tag (default: latest)"
    echo ""
    echo "Examples:"
    echo "  $0 build --tag v1.0.0"
    echo "  $0 run --port 8080 --env dev"
    echo "  $0 logs"
}

build_image() {
    local tag=${1:-latest}
    
    print_status "🏗️ Building Docker image: ${IMAGE_NAME}:${tag}" "$BLUE"
    
    if [ "$ENV" = "dev" ]; then
        docker build -f scripts/docker/Dockerfile.dev -t "${IMAGE_NAME}:${tag}" .
    else
        docker build -f scripts/docker/Dockerfile -t "${IMAGE_NAME}:${tag}" .
    fi
    
    print_status "✅ Image built successfully" "$GREEN"
}

run_container() {
    local tag=${1:-latest}
    
    # Stop existing container if running
    if docker ps -q -f name=$CONTAINER_NAME | grep -q .; then
        print_status "⏹️ Stopping existing container..." "$YELLOW"
        docker stop $CONTAINER_NAME
        docker rm $CONTAINER_NAME
    fi
    
    print_status "🚀 Starting container on port $PORT..." "$BLUE"
    
    if [ "$ENV" = "dev" ]; then
        docker run -d \
            --name $CONTAINER_NAME \
            -p $PORT:4321 \
            -v $(pwd):/app \
            -v /app/node_modules \
            -e NODE_ENV=development \
            -e DATA_SOURCE=sqlite \
            -e DEPLOY_MODE=standalone \
            "${IMAGE_NAME}:${tag}"
    else
        docker run -d \
            --name $CONTAINER_NAME \
            -p $PORT:4321 \
            -v koalablog-data:/app/data \
            -v koalablog-uploads:/app/uploads \
            -e NODE_ENV=production \
            -e DATA_SOURCE=sqlite \
            -e DEPLOY_MODE=standalone \
            --restart unless-stopped \
            "${IMAGE_NAME}:${tag}"
    fi
    
    print_status "✅ Container started successfully" "$GREEN"
    print_status "📱 Application available at: http://localhost:$PORT" "$BLUE"
}

stop_container() {
    if docker ps -q -f name=$CONTAINER_NAME | grep -q .; then
        print_status "⏹️ Stopping container..." "$YELLOW"
        docker stop $CONTAINER_NAME
        print_status "✅ Container stopped" "$GREEN"
    else
        print_status "ℹ️ Container is not running" "$YELLOW"
    fi
}

restart_container() {
    stop_container
    sleep 2
    
    if docker ps -aq -f name=$CONTAINER_NAME | grep -q .; then
        print_status "🔄 Starting existing container..." "$BLUE"
        docker start $CONTAINER_NAME
        print_status "✅ Container restarted" "$GREEN"
    else
        print_status "❌ No existing container to restart. Use 'run' command." "$RED"
        exit 1
    fi
}

show_logs() {
    if docker ps -aq -f name=$CONTAINER_NAME | grep -q .; then
        print_status "📋 Showing container logs..." "$BLUE"
        docker logs -f --tail 100 $CONTAINER_NAME
    else
        print_status "❌ Container not found" "$RED"
        exit 1
    fi
}

clean_all() {
    print_status "🧹 Cleaning up..." "$YELLOW"
    
    # Stop and remove container
    if docker ps -aq -f name=$CONTAINER_NAME | grep -q .; then
        docker stop $CONTAINER_NAME || true
        docker rm $CONTAINER_NAME || true
    fi
    
    # Remove image
    if docker images -q $IMAGE_NAME | grep -q .; then
        docker rmi $IMAGE_NAME || true
    fi
    
    # Clean up unused volumes (optional)
    read -p "Remove persistent data volumes? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        docker volume rm koalablog-data koalablog-uploads 2>/dev/null || true
    fi
    
    print_status "✅ Cleanup completed" "$GREEN"
}

check_health() {
    if docker ps -q -f name=$CONTAINER_NAME | grep -q .; then
        print_status "🏥 Checking container health..." "$BLUE"
        
        # Check if container is running
        if docker ps --format "table {{.Names}}\t{{.Status}}" | grep $CONTAINER_NAME | grep -q "Up"; then
            # Test health endpoint
            if curl -f -s http://localhost:$PORT/api/health > /dev/null; then
                print_status "✅ Container is healthy" "$GREEN"
                curl -s http://localhost:$PORT/api/health | jq .
            else
                print_status "❌ Health check failed" "$RED"
                exit 1
            fi
        else
            print_status "❌ Container is not running" "$RED"
            exit 1
        fi
    else
        print_status "❌ Container not found" "$RED"
        exit 1
    fi
}

backup_data() {
    local backup_dir="./backups/$(date +%Y%m%d_%H%M%S)"
    
    print_status "💾 Creating backup..." "$BLUE"
    mkdir -p "$backup_dir"
    
    # Backup volumes
    docker run --rm -v koalablog-data:/data -v koalablog-uploads:/uploads -v $(pwd)/$backup_dir:/backup alpine \
        sh -c "cp -r /data /backup/ && cp -r /uploads /backup/"
    
    print_status "✅ Backup created at: $backup_dir" "$GREEN"
}

restore_data() {
    local backup_path=$1
    
    if [ -z "$backup_path" ]; then
        print_status "❌ Please specify backup path" "$RED"
        exit 1
    fi
    
    if [ ! -d "$backup_path" ]; then
        print_status "❌ Backup directory not found: $backup_path" "$RED"
        exit 1
    fi
    
    print_status "📦 Restoring from backup..." "$BLUE"
    
    # Stop container before restore
    stop_container
    
    # Restore volumes
    docker run --rm -v koalablog-data:/data -v koalablog-uploads:/uploads -v $(pwd)/$backup_path:/backup alpine \
        sh -c "cp -r /backup/data/* /data/ && cp -r /backup/uploads/* /uploads/"
    
    print_status "✅ Data restored successfully" "$GREEN"
}

# Parse arguments
COMMAND=""
TAG="latest"

while [[ $# -gt 0 ]]; do
    case $1 in
        --port)
            PORT="$2"
            shift 2
            ;;
        --env)
            ENV="$2"
            shift 2
            ;;
        --tag)
            TAG="$2"
            shift 2
            ;;
        --help|-h)
            show_help
            exit 0
            ;;
        *)
            if [ -z "$COMMAND" ]; then
                COMMAND="$1"
                shift
            else
                BACKUP_PATH="$1"
                shift
            fi
            ;;
    esac
done

# Execute command
case $COMMAND in
    build)
        build_image $TAG
        ;;
    run)
        run_container $TAG
        ;;
    stop)
        stop_container
        ;;
    restart)
        restart_container
        ;;
    logs)
        show_logs
        ;;
    clean)
        clean_all
        ;;
    health)
        check_health
        ;;
    backup)
        backup_data
        ;;
    restore)
        restore_data $BACKUP_PATH
        ;;
    *)
        print_status "❌ Unknown command: $COMMAND" "$RED"
        show_help
        exit 1
        ;;
esac