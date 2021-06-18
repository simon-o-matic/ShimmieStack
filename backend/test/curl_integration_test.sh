#!/bin/sh


SERVER=localhost:8080


echo "Whats the time Mr. Wolf?"
curl $SERVER/admin/mrwolf
echo

echo "Drop all tables"
curl -X POST $SERVER/admin/drop_database_tables
echo

echo "Show no database tables"
curl $SERVER/admin/show_database_tables
echo

echo "Show (no) events in the missing table"
curl $SERVER/admin/events
echo

echo "Post (not) a new narrative"
curl -d @packet1.json $SERVER/narratives --header "Content-Type: application/json"
echo

echo "Create the tables"
curl -X POST $SERVER/admin/create_database_tables
echo

echo "Show 0 events in the empty events table"
curl $SERVER/admin/events
echo

echo "Post a new narrative "
curl -d @packet1.json $SERVER/narratives --header "Content-Type: application/json"
echo

echo "Show 1 event in the events table"
curl $SERVER/admin/events

echo "Post 2nd narrative "
curl -d @packet2.json $SERVER/narratives --header "Content-Type: application/json"
echo

echo "Show 2 events in the events table"
curl $SERVER/admin/events
