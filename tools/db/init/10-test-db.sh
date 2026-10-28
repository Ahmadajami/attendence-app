#!/bin/sh
# Runs once, on the first start of an empty volume: create the synthetic
# test database next to the real-data one.
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-'SQL'
	CREATE DATABASE attendance_app_test OWNER attendance_app;
SQL
