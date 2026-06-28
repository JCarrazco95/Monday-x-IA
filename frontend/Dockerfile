# MAXIRent frontend (Vite build -> Nginx, con proxy /api al backend)
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY nginx.conf.template /etc/nginx/nginx.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
# Render/Railway inyectan PORT; BACKEND_URL = URL publica del backend.
ENV PORT=8080
ENV BACKEND_URL=http://localhost:4000
CMD ["/bin/sh","-c","envsubst '${PORT} ${BACKEND_URL}' < /etc/nginx/nginx.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
