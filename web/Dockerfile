FROM node:22-alpine

ARG BUILD_STAMP=dev
ENV BUILD_STAMP=$BUILD_STAMP
# Google client id is injected at build time so the frontend can render the
# "Continue with Google" button. Empty when Google sign-in is disabled.
ARG VITE_GOOGLE_CLIENT_ID=
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
