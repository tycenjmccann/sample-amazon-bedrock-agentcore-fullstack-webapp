#!/bin/bash
# Local Development Script - Start frontend and AgentCore backend locally

set -e

echo "Starting Local Development Mode"
echo "=================================="

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo "Python 3 is required but not installed"
    exit 1
fi

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo "Node.js is required but not installed"
    exit 1
fi

# Install agent dependencies if needed
echo "Installing agent dependencies..."
if [ ! -d "agent/venv" ]; then
    echo "Creating Python virtual environment..."
    cd agent
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
    cd ..
else
    echo "Virtual environment already exists"
fi

# Install management backend dependencies if needed
echo "Installing management backend dependencies..."
if [ ! -d "backend/venv" ]; then
    echo "Creating management backend virtual environment..."
    cd backend
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
    cd ..
else
    echo "Management backend virtual environment already exists"
fi

# Install frontend dependencies if needed
echo "📦 Installing frontend dependencies..."
cd frontend
if [ ! -d "node_modules" ]; then
    npm install
fi
cd ..

# Create local environment file for frontend
echo "⚙️  Setting up local environment..."

# Remove any production environment file
if [ -f "frontend/.env.production.local" ]; then
    rm frontend/.env.production.local
fi

cat > frontend/.env.local << EOF
VITE_LOCAL_DEV=true
VITE_AGENT_RUNTIME_URL=/api
EOF

echo "Created local development environment configuration"

echo ""
echo "Starting services..."
echo "Agent backend will be available at: http://localhost:8080"
echo "Management API will be available at: http://localhost:8081"
echo "Frontend will be available at: http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Function to cleanup background processes
cleanup() {
    echo ""
    echo "🛑 Stopping services..."
    jobs -p | xargs -r kill
    exit 0
}

trap cleanup SIGINT SIGTERM

# Start AgentCore backend in background
echo "Starting AgentCore backend..."
cd agent
source venv/bin/activate

# Check if AWS credentials are available
if ! aws sts get-caller-identity > /dev/null 2>&1; then
    echo "WARNING: AWS credentials not found. The agent needs AWS credentials to call Bedrock."
    echo "Please configure AWS credentials using one of these methods:"
    echo "  1. aws configure"
    echo "  2. aws sso login --profile <profile-name>"
    echo "  3. Set environment variables: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY"
    echo ""
    echo "Press Enter to continue anyway, or Ctrl+C to exit and configure credentials first..."
    read
fi

python strands_agent.py &
BACKEND_PID=$!
cd ..

# Wait a moment for agent backend to start
sleep 2

# Start management API backend in background
echo "Starting management API backend..."
cd backend
source venv/bin/activate
python app.py &
MGMT_PID=$!
cd ..

# Wait a moment for management backend to start
sleep 2

# Start frontend dev server in background
echo "Starting frontend dev server..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

# Wait for all processes
wait $BACKEND_PID $MGMT_PID $FRONTEND_PID
