// Web RTC Video Chat Server

type Chatroom = {
    offer?: {
        sdp: string,
    },
    answer?: {
        sdp: string,
    }
}

const chats = new Map<string, Chatroom | null>()

const server = Bun.serve<{ chatroom: string }>({
    port: 8080,
    fetch(req, server) {
        const url = new URL(req.url)
        const paths = url.pathname.split("/")

        if (paths[1] === "offer") {
            const offer = chats.get(paths[2])?.offer
            if (!offer) {
                return new Response("No offer found", {
                    status: 404,
                    headers: {
                        "Access-Control-Allow-Origin": "*",
                    }
                })
            }
            return new Response(JSON.stringify(chats.get(paths[2])?.offer), {
                status: 200,
                headers: {
                    "Access-Control-Allow-Origin": "*",
                }
            })
        }

        const chatroom = paths[2]

        const success = server.upgrade(req, {
            data: {
                chatroom
            }
        })

        if (success) {
            return
        }
        return new Response("Could not upgrade connection")
    },
    websocket: {
        open(client) {
            console.log("Client connected to " + client.data.chatroom)
            client.subscribe(client.data.chatroom)
        },
        message(client, message) {
            const messageData = JSON.parse(message.toString())
            if (messageData.type === "offer") {
                const chatroom = chats.get(client.data.chatroom)
                if (!chatroom) {
                    chats.set(client.data.chatroom, {
                        offer: messageData.data
                    })
                }
            }

            if (messageData.type === "answer") {
                const chatroom = chats.get(client.data.chatroom)
                if (chatroom && chatroom.offer) {
                    chatroom.answer = messageData.data
                    server.publish(client.data.chatroom, JSON.stringify({
                        type: "answer",
                        data: chatroom.answer,
                    }))
                }
            }

            if (messageData.type === "offer-ice-candidate") {
                server.publish(client.data.chatroom, JSON.stringify({
                    type: "offer-ice-candidate",
                    data: messageData.data
                }))
            }

            if (messageData.type === "answer-ice-candidate") {
                server.publish(client.data.chatroom, JSON.stringify({
                    type: "answer-ice-candidate",
                    data: messageData.data
                }))
            }
        },
        close(client) {
            chats.set(client.data.chatroom, null)
            console.log("Client disconnected")
            console.log("Chat gelöscht?", chats.get(client.data.chatroom) === null ? "Ja" : "Nein")
        },
    }
})

console.log("Server running on port 8080")