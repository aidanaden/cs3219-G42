import { StateCreator } from "zustand";
import { io, Socket } from "socket.io-client";
import toast from "react-hot-toast";

import { User } from "src/login";
import type { GlobalStore, Status } from "./useGlobalStore";
import { MATCH_EVENTS, StatusType } from "./enums";

export type QuestionDifficulty = "easy" | "medium" | "hard";

export type PoolUser = User & {
  difficulties: QuestionDifficulty[];
};

export type MatchSlice = {
  matchSocket: Socket | undefined;
  matchSocketConnected: boolean;
  matchDifficulties: QuestionDifficulty[];
  setMatchDifficulties: (difficulties: QuestionDifficulty[]) => void;
  queueStatus: Status | undefined;
  isInQueue: boolean;
  queueRoomId: string | undefined;
  joinQueue: (difficulties: QuestionDifficulty[]) => void;
  leaveQueue: () => void;
};

const createMatchSlice: StateCreator<GlobalStore, [], [], MatchSlice> = (
  setState,
  getState
) => {
  const setMatchDifficulties = (difficulties: QuestionDifficulty[]) => {
    setState({ matchDifficulties: difficulties });
  };

  const matchSocket = io(`${import.meta.env.VITE_API_URL}/match`, {
    withCredentials: true,
    transports: ["websocket"],
    autoConnect: false,
  });

  matchSocket.on("connect", () => {
    console.log("connected to /match ws server :)");
    setState({ matchSocketConnected: true });
  });

  matchSocket.on("disconnect", () => {
    console.log("disconnected from /match ws server :(");
    setState({ matchSocketConnected: false });
  });

  // handle already matched
  matchSocket.on(MATCH_EVENTS.ROOM_EXISTS, (data) => {
    const {
      message,
      existingRoomId,
    }: { message: string; existingRoomId: string } = JSON.parse(data);
    const queueStatusMsg = `You are already in room ${existingRoomId}. Leave the room before trying to join another match!`;
    const queueStatus: Status = {
      status: StatusType.ERROR,
      event: MATCH_EVENTS.ROOM_EXISTS,
      message: queueStatusMsg,
    };
    toast(queueStatusMsg);
    console.error(message);
    setState({
      isInQueue: false,
      queueRoomId: existingRoomId,
      queueStatus: queueStatus,
    });
  });

  // handle joined queue (no match found)
  matchSocket.on(MATCH_EVENTS.JOIN_QUEUE_SUCCESS, (data) => {
    const { message }: { message: string } = JSON.parse(data);
    const queueStatus: Status = {
      status: StatusType.SUCCESS,
      event: MATCH_EVENTS.JOIN_QUEUE_SUCCESS,
      message,
    };
    setState({ isInQueue: true, queueStatus });
  });

  // handle match found
  matchSocket.on(MATCH_EVENTS.MATCH_FOUND, (data) => {
    const { matchedRoomId }: { message: string; matchedRoomId: string } =
      JSON.parse(data);
    const queueStatusMsg = `Match found! Joining room ${matchedRoomId}...`;
    const queueStatus: Status = {
      status: StatusType.SUCCESS,
      event: MATCH_EVENTS.MATCH_FOUND,
      message: queueStatusMsg,
    };
    toast(queueStatusMsg);
    // join room
    setState({
      isInQueue: false,
      queueRoomId: matchedRoomId,
      queueStatus,
    });
  });

  // handle join queue error
  matchSocket.on(MATCH_EVENTS.JOIN_QUEUE_ERROR, (data) => {
    const { message }: { message: string } = JSON.parse(data);
    const queueStatusMsg = "Error joining queue. Try again later!";
    const queueStatus: Status = {
      status: StatusType.ERROR,
      event: MATCH_EVENTS.JOIN_QUEUE_ERROR,
      message: queueStatusMsg,
    };
    toast(queueStatusMsg);
    console.error(message);
    setState({ isInQueue: false, queueStatus });
  });

  // handle leave queue success
  matchSocket.on(MATCH_EVENTS.LEAVE_QUEUE_SUCCESS, (data) => {
    const { message }: { message: string } = JSON.parse(data);
    const queueStatusMsg = "Left queue successfully!";
    const queueStatus: Status = {
      status: StatusType.SUCCESS,
      event: MATCH_EVENTS.LEAVE_QUEUE_SUCCESS,
      message: queueStatusMsg,
    };
    toast(queueStatusMsg);
    setState({ isInQueue: false, queueRoomId: undefined, queueStatus });
  });

  // handle leave queue error
  matchSocket.on(MATCH_EVENTS.LEAVE_QUEUE_ERROR, (data) => {
    const { message }: { message: string } = JSON.parse(data);
    const queueStatusMsg = "Error leaving queue. Try again later!";
    const queueStatus: Status = {
      status: StatusType.ERROR,
      event: MATCH_EVENTS.LEAVE_QUEUE_ERROR,
      message: queueStatusMsg,
    };
    toast(queueStatusMsg);
    console.error(message);
    setState({ queueStatus });
  });

  const joinQueue = (difficulties: QuestionDifficulty[]) => {
    const user = getState().user;
    if (!user) {
      console.error("user not logged in, cannot join queue!");
      return;
    }
    const socket = getState().matchSocket;
    if (!socket) {
      console.error("socket not set, cannot join queue!");
      return;
    }
    const poolUser: PoolUser = {
      ...user,
      difficulties,
    };
    socket.emit(MATCH_EVENTS.JOIN_QUEUE, JSON.stringify(poolUser));
  };

  const leaveQueue = () => {
    const user = getState().user;
    if (!user) {
      console.error("user not logged in, cannot leave queue!");
      return;
    }
    const socket = getState().matchSocket;
    if (!socket) {
      console.error("socket not set, cannot leave queue!");
      return;
    }
    if (!getState().isInQueue) {
      console.error("user already disconnected from the queue!");
      return;
    }
    const payload = JSON.stringify({ id: user.id });
    console.log("leaving queue: ", { payload });
    socket.emit(MATCH_EVENTS.LEAVE_QUEUE, payload);
  };

  return {
    matchSocket,
    matchSocketConnected: false,
    matchDifficulties: ["easy"],
    setMatchDifficulties,
    queueStatus: undefined,
    isInQueue: false,
    queueRoomId: undefined,
    joinQueue,
    leaveQueue,
  };
};

export { createMatchSlice };