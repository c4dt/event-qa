# Technical Description

## Backend / Frontend

TODO: describe the technology used for the backend / frontend

## Deployment

Use the docker-compose.yaml file to start the service
on your server.
All TLS termination has to be done by a proxy, e.g.,
traefik.
The traefik configuration is not part of this setup.

## Configuration

The configuration is done with a yaml file called
event.yaml, with the following format:

TODO: describe format, following what is written in
the README.md

## CI/CD

It uses a standard CI/CD from github:
- formatting verification
- test OK
- create and publish docker image
