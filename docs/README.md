# Development Notes

## Overview of Client <-> Server Data Flow

The client communicates with the server over HTTP(S). All request URLs end with the clients session key with the exception of the login and steam overlay requests. When the client has data to send to the server, it makes a POST request to a given route, in most cases the server responds with status 200 and no data however there are some exceptions, such as posting to the leaderboards route. To receive data which is not returned after making a POST request the client makes GET requests to the server every 2 seconds. If the server has new data for the client it is returned in the response otherwise the server responds with status 200 and no data. All data returned from the server is JSON formatted. All data sent to the server is JSON formatted with the exception of the location update and chat message send requests, these are plaintext strings.

Detailed Information:
1. [Game Flow](gameFlow.md)
2. [Data Structures](dataStructures.md)
3. [Server Endpoints](serverEndpoints.md)
4. [Other Notes](notes.md)

