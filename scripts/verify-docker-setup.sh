#!/bin/bash

# Docker设置验证脚本
set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() {
    echo -e "${2}${1}${NC}"
}

print_header() {
    echo -e "\n${BLUE}=== $1 ===${NC}"
}

# 检查文件结构
check_file_structure() {
    print_header "检查文件结构"
    
    local files=(
        "scripts/docker/Dockerfile"
        "scripts/docker/Dockerfile.dev"
        "scripts/docker/docker-compose.yml"
        "scripts/docker/docker-compose.dev.yml"
        "scripts/docker/config/nginx/nginx.conf"
        "scripts/docker/DOCKER.md"
        "scripts/docker/README.md"
    )
    
    for file in "${files[@]}"; do
        if [ -f "$file" ]; then
            print_status "✅ $file" "$GREEN"
        else
            print_status "❌ $file (缺失)" "$RED"
        fi
    done
}

# 验证Docker文件语法
validate_docker_files() {
    print_header "验证Docker文件语法"
    
    # 检查Dockerfile语法
    if command -v docker >/dev/null 2>&1; then
        print_status "检查Dockerfile语法..." "$BLUE"
        if docker build -f scripts/docker/Dockerfile --no-cache -t koalablog:syntax-test . >/dev/null 2>&1; then
            print_status "✅ Dockerfile语法正确" "$GREEN"
            docker rmi koalablog:syntax-test >/dev/null 2>&1 || true
        else
            print_status "❌ Dockerfile语法错误" "$RED"
        fi
    else
        print_status "⚠️ Docker未安装,跳过语法检查" "$YELLOW"
    fi
    
    # 检查docker-compose文件格式
    if command -v docker-compose >/dev/null 2>&1; then
        print_status "检查docker-compose.yml语法..." "$BLUE"
        if docker-compose -f scripts/docker/docker-compose.yml config >/dev/null 2>&1; then
            print_status "✅ docker-compose.yml语法正确" "$GREEN"
        else
            print_status "❌ docker-compose.yml语法错误" "$RED"
        fi
    else
        print_status "⚠️ docker-compose未安装,跳过语法检查" "$YELLOW"
    fi
}

# 验证npm脚本
validate_npm_scripts() {
    print_header "验证NPM脚本"
    
    local scripts=(
        "docker:build"
        "docker:build:dev"
        "compose:up"
        "compose:down"
        "compose:dev"
        "compose:prod"
    )
    
    for script in "${scripts[@]}"; do
        if grep -q "\"$script\":" package.json; then
            print_status "✅ $script" "$GREEN"
        else
            print_status "❌ $script (缺失)" "$RED"
        fi
    done
}

# 检查路径引用
check_path_references() {
    print_header "检查路径引用"
    
    # 检查docker-compose文件中的路径
    print_status "检查docker-compose文件中的路径引用..." "$BLUE"
    
    if grep -q "context: ../../" scripts/docker/docker-compose.yml; then
        print_status "✅ docker-compose.yml context路径正确" "$GREEN"
    else
        print_status "❌ docker-compose.yml context路径错误" "$RED"
    fi
    
    if grep -q "dockerfile: scripts/docker/Dockerfile" scripts/docker/docker-compose.yml; then
        print_status "✅ docker-compose.yml dockerfile路径正确" "$GREEN"
    else
        print_status "❌ docker-compose.yml dockerfile路径错误" "$RED"
    fi
    
    if grep -q "./config/nginx/nginx.conf" scripts/docker/docker-compose.yml; then
        print_status "✅ nginx配置路径正确" "$GREEN"
    else
        print_status "❌ nginx配置路径错误" "$RED"
    fi
}

# 验证脚本权限
check_script_permissions() {
    print_header "检查脚本权限"
    
    local scripts=(
        "scripts/docker-deploy.sh"
        "scripts/verify-docker-setup.sh"
    )
    
    for script in "${scripts[@]}"; do
        if [ -x "$script" ]; then
            print_status "✅ $script (可执行)" "$GREEN"
        else
            print_status "❌ $script (不可执行)" "$RED"
            print_status "   运行: chmod +x $script" "$YELLOW"
        fi
    done
}

# 生成使用示例
show_usage_examples() {
    print_header "使用示例"
    
    cat << EOF
${GREEN}✅ 推荐使用方式:${NC}

${BLUE}1. 使用NPM脚本 (推荐):${NC}
   pnpm run docker:build
   pnpm run compose:up

${BLUE}2. 使用便捷脚本:${NC}
   ./scripts/docker-deploy.sh build
   ./scripts/docker-deploy.sh run

${BLUE}3. 直接使用Docker Compose:${NC}
   docker-compose -f scripts/docker/docker-compose.yml up -d

${BLUE}4. 开发模式:${NC}
   pnpm run compose:dev

${BLUE}5. 生产模式 (含Nginx):${NC}
   pnpm run compose:prod

${YELLOW}📖 详细文档:${NC}
   scripts/docker/DOCKER.md
   scripts/docker/README.md
EOF
}

# 主函数
main() {
    print_status "🐳 Docker设置验证工具" "$BLUE"
    
    check_file_structure
    validate_docker_files
    validate_npm_scripts
    check_path_references
    check_script_permissions
    show_usage_examples
    
    print_status "\n🎉 验证完成!" "$GREEN"
}

main "$@"