#!/usr/bin/env bash

echo $CC
echo $CXX
# export CXX=g++-4.8
export TEST_RUN=true

git clone https://github.com/creationix/nvm.git /tmp/.nvm
source /tmp/.nvm/nvm.sh
nvm install "$NODE_VERSION"
nvm use "$NODE_VERSION"

if [[ "$TRAVIS_OS_NAME" == "linux" ]]; then
  export DISPLAY=:99.0
  sh -e /etc/init.d/xvfb start
  sleep 3
fi

node --version
npm --version

# npm install electron-packager -g

npm install --no-optional

# npm run testbuild
