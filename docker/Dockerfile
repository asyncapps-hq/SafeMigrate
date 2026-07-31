FROM node:22-bookworm
RUN apt-get update && apt-get install -y docker.io postgresql-client && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages ./packages
COPY apps ./apps
COPY fixtures ./fixtures
COPY .safemigrate.yml tsconfig.base.json action.yml ./
RUN npm install
CMD ["npm", "run", "demo"]
