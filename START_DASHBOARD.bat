@echo off
title Project - Genomic Dashboard
if not exist node_modules (
  echo Installing dependencies...
  call npm install
)
echo Starting the dashboard in your default browser...
call npm run dev:browser
