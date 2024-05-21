"use client"
import { useEffect, useRef, useState } from "react";

export default function App() {

  const [peerConnection, setPeerConnection] = useState<RTCPeerConnection | null>(null)
  const [connectedCall, setConnectedCall] = useState<string | null>(null)
  const [_socket, setSocket] = useState<WebSocket | null>(null)

  const [callIdInput, setCallIdInput] = useState<string>("")


  const localVideo = useRef<HTMLVideoElement | null>(null)
  const remoteVideo = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {

    const servers = getICEServers()
    setPeerConnection(new RTCPeerConnection(servers))

  }, [])

  return (
    <div className="">
      <div className="border-2 border-neutral-500 rounded p-4 text-center mb-3">
        <h1 className="font-bold text-4xl">Web RTC Demo</h1>
      </div>
      <div className="flex flex-col items-center gap-2 mb-2">
        <button onClick={startWebcam} className="px-3 py-2 bg-green-600 rounded ">1. Starte Webcam</button>
        <p className="text-center">{connectedCall ? "Chatroom " + connectedCall : ""}</p>
        <div className="flex justify-center gap-3">
          <div className="flex flex-col">
            <p className="text-bold text-center text-xl">Dein Video</p>
            <video
              ref={localVideo}
              autoPlay muted playsInline
              className="aspect-video bg-neutral-600 border-2 border-blue-500 h-64 rounded-lg"
            />
          </div>
          <div className="flex-col justify-center gap-3">
            <p className="text-bold text-center text-xl">Anderes Video</p>
            <video
              ref={remoteVideo}
              autoPlay muted playsInline
              className="aspect-video bg-neutral-600 border-2 border-red-500 h-64 rounded-lg"
            />
          </div>
        </div>
      </div>
      <div className="flex flex-col items-center gap-2">
        <label className="text-left" htmlFor="chatroomId">
          Raum ID
        </label>
        <input
          onChange={(e) => setCallIdInput(e.target.value)}
          className="bg-transparent text-neutral-200 border-2 border-neutral-200 px-3 py-2 text-center rounded"
          name="chatroomId" />
        <div className="flex gap-3 mx-auto">
          <button onClick={startCall} disabled={!localVideo.current?.srcObject || !callIdInput} className="px-3 py-2 bg-blue-500 rounded-md disabled:bg-neutral-700 border-2 border-blue-500 disabled:border-blue-500">Call starten</button>
          <button onClick={answerCall} disabled={!localVideo.current?.srcObject || !callIdInput} className="px-3 py-2 bg-red-500 rounded-md disabled:bg-neutral-700 border-2 border-red-500 disabled:border-red-500">Call beitreten</button>
        </div>
      </div>
    </div>
  )

  async function startWebcam() {

    if (!peerConnection) {
      throw new Error("Peer connection not initialized")
    }

    const localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

    const remoteStream = new MediaStream();

    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream)
    })

    // Wenn Video Stream vom anderen Peer kommt
    peerConnection.ontrack = event => {
      event.streams[0].getTracks().forEach(track => {
        remoteStream.addTrack(track)
      })
    }

    // Zeige das Bild im Video Element an
    localVideo.current!.srcObject = localStream
    remoteVideo.current!.srcObject = remoteStream
  }

  function startCall() {
    const socket = new WebSocket(`wss://${import.meta.env.VITE_WS_URL}/chat/${callIdInput}`)

    socket.onopen = async () => {
      socket.onmessage = event => handleMessageOffer(JSON.parse(event.data))
      if (!peerConnection) throw new Error("Peer connection not initialized")

      setSocket(socket)
      setConnectedCall(callIdInput)

      peerConnection.onicecandidate = event => {
        if (!event.candidate) return
        socket.send(JSON.stringify({
          type: "offer-ice-candidate",
          data: event.candidate?.toJSON()
        }))
      }

      const offer = await peerConnection.createOffer()
      socket.send(JSON.stringify({
        type: "offer",
        data: offer
      }))

      await peerConnection.setLocalDescription(offer)

    }
    socket.onclose = () => setConnectedCall(null)

  }

  async function answerCall() {
    const socket = new WebSocket(`wss://${import.meta.env.VITE_WS_URL}/chat/${callIdInput}`)

    socket.onopen = async () => {
      socket.onmessage = event => handleMessageAnswer(JSON.parse(event.data))
      setSocket(socket)
      setConnectedCall(callIdInput)
      if (!peerConnection) throw new Error("Peer connection not initialized")

      peerConnection.onicecandidate = event => {
        if (!event.candidate) return
        socket.send(JSON.stringify({
          type: "answer-ice-candidate",
          data: event.candidate
        }))
      }

      // Get Offer from Server
      const response = await fetch(`https://${import.meta.env.VITE_WS_URL}/offer/${callIdInput}`)
      if (!response.ok) throw new Error("Offer not found")
      const offer = await response.json()


      await peerConnection.setRemoteDescription(offer)

      const answer = await peerConnection.createAnswer()
      socket.send(JSON.stringify({
        type: "answer",
        data: answer
      }))
      await peerConnection.setLocalDescription(answer)

    }
    socket.onclose = () => setConnectedCall(null)
  }

  function handleMessageOffer(msg: any) {
    if (!peerConnection) throw new Error("Peer connection not initialized")
    if (msg.type === "answer") {
      const answer = new RTCSessionDescription(msg.data)
      peerConnection.setRemoteDescription(answer)
      return
    }
    if (msg.type === "answer-ice-candidate") {
      const candidate = new RTCIceCandidate(msg.data)
      peerConnection.addIceCandidate(candidate)
      return
    }
  }

  function handleMessageAnswer(msg: any) {
    if (!peerConnection) throw new Error("Peer connection not initialized")
    if (msg.type === "offer") {
      const offer = new RTCSessionDescription(msg.data)
      peerConnection.setRemoteDescription(offer)
      return
    }
    if (msg.type === "offer-ice-candidate") {
      const candidate = new RTCIceCandidate(msg.data)
      peerConnection.addIceCandidate(candidate)
      return
    }
  }

}

function getICEServers() {
  return {
    iceServers: [{
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    }],
    iceCandidatePoolSize: 10,
  }
}