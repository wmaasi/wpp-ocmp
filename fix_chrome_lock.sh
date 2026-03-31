#!/bin/bash
TOKEN_DIR="/home/william_maas/wpp-ocmp/tokens/ocmp-bot"

echo "🔧 Eliminando locks de Chromium..."
rm -f $TOKEN_DIR/SingletonLock
rm -f $TOKEN_DIR/SingletonCookie
rm -f $TOKEN_DIR/SingletonSocket

echo "🔧 Locks limpiados."
