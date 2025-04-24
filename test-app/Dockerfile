FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install

# Copy app files
COPY . .

# Expose Vite's dev server port
EXPOSE 5173

# Start the Vite development server with host set to listen on all interfaces
CMD ["pnpm", "run", "dev", "--host", "0.0.0.0"]