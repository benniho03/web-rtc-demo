"use client"
import { useEffect, useRef, useState } from "react";

export default function App() {

  const [peerConnection, setPeerConnection] = useState<RTCPeerConnection | null>(null)
  const [connectedCall, setConnectedCall] = useState<string | null>(null)
  const [socket, setSocket] = useState<WebSocket | null>(null)

  const [callIdInput, setCallIdInput] = useState<string>("")


  const localVideo = useRef<HTMLVideoElement | null>(null)
  const remoteVideo = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {

    const servers = getICEServers()
    setPeerConnection(new RTCPeerConnection(servers))

  }, [])

  return (
    <div className="">
      <p className="text-center font-bold text-2xl">{connectedCall ? "Chatroom " + connectedCall : ""}</p>
      <div className="flex flex-col items-center gap-2">
        <div className="flex justify-center">
          <video ref={localVideo} autoPlay muted playsInline className="aspect-video bg-neutral-600 border-2 border-neutral-200 h-64"></video>
          <video ref={remoteVideo} autoPlay muted playsInline className="aspect-video bg-neutral-600 border-2 border-neutral-200 h-64"></video>
        </div>
        <button onClick={startWebcam} className="px-3 py-2 bg-neutral-600 rounded-md">Starte Webcam</button>
      </div>
      <div>
        <input
          onChange={(e) => setCallIdInput(e.target.value)}
          className="bg-transparent text-neutral-200 border-2 border-neutral-200 px-3 py-2 text-center" />
        <button onClick={startCall} disabled={!localVideo.current?.srcObject || !callIdInput} className="px-3 py-2 bg-neutral-600 rounded-md disabled:bg-neutral-700">Call starten</button>
        <button onClick={answerCall} disabled={!localVideo.current?.srcObject || !callIdInput} className="px-3 py-2 bg-neutral-600 rounded-md disabled:bg-neutral-700">Call beitreten</button>
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
    const socket = new WebSocket(`ws://${import.meta.env.VITE_WS_URL}/chat/${callIdInput}`)

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
    const socket = new WebSocket(`ws://${import.meta.env.VITE_WS_URL}/chat/${callIdInput}`)

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
      const response = await fetch(`http://${import.meta.env.VITE_WS_URL}/offer/${callIdInput}`)
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