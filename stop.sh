#!/bin/bash
# stop.sh - Stops the background bot gracefully

if [ ! -f "bot.pid" ]; then
    echo "No bot.pid found. Is the bot running?"
    exit 1
fi

PID=$(cat bot.pid)

if kill -0 $PID 2>/dev/null; then
    echo "Stopping bot with PID $PID..."
    kill -15 $PID

    # Wait for the process to stop
    sleep 2
    if kill -0 $PID 2>/dev/null; then
        echo "Process didn't stop cleanly, forcefully killing..."
        kill -9 $PID
    fi
    echo "Bot stopped."
else
    echo "Process with PID $PID is not running."
fi

rm -f bot.pid
