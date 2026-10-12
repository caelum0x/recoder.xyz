#!/usr/bin/env bash
find . -path ./node_modules -prune -o -path ./.git -prune -o -print | sort
