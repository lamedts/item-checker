#!/bin/bash
# start.sh - Runs the bot in the background

if [ -f "bot.pid" ] && kill -0 $(cat bot.pid) 2>/dev/null; then
    echo "Bot is already running with PID $(cat bot.pid). Run ./stop.sh first if you want to restart."
    exit 1
fi

echo "Starting bot in background..."
nohup bun start > bot.log 2>&1 &
PID=$!
echo $PID > bot.pid
echo "Bot started with PID $PID. Logs are being written to bot.log"
echo "You can view logs actively with: tail -f bot.log"
