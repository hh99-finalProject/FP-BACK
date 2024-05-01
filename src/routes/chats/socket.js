// src/routes/chats/socket.js
import { Server as SocketIOServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import { prisma } from '../../utils/prisma/index.js';
import moment from 'moment-timezone';
import axios from 'axios';
// import { getLastMessageTimestamp, setLastMessageTimestamp } from '../../utils/timestampUtils.js';
// import { clearSocketPastMessages } from '../../utils/socketMessageHandling.js';

const lastMessageTimestamps = new Map(); // 각 소켓 세션의 마지막 메시지 타임스탬프를 저장하는 Map 객체

// 20240430 첫 연결 성공. 토큰 확인.
const initializeSocket = (server, corsOptions) => {
    const io = new SocketIOServer(server, {
        cors: corsOptions,
    });

    const userSockets = {}; // 사용자와 소켓 간의 매핑을 저장할 객체
    let userRooms = {}; // 사용자의 방 정보를 저장할 객체

    // connection이 수립되면 event handler function의 인자로 socket이 들어온다
    io.on('connection', async (socket) => {
        console.log('사용자가 연결되었습니다.', socket.id); // 소켓마다 고유의 식별자를 가짐 (20자)
        console.log('연결 횟수 >> ', io.engine.clientsCount); // 연결된 소켓의 개수

        // 인증 토큰 검증
        const token = socket.handshake.auth.token; // 클라이언트로부터 받은 토큰
        socket.emit('connected', { message: '백엔드 소켓 연결에 성공했습니다!' });

        // 토큰이 존재하는 경우에만 처리
        if (token) {
            const [bearer, tokenValue] = token.split(' ');
            if (bearer !== 'Bearer') {
                socket.emit('token error', { message: '토큰 타입이 Bearer 형식이 아닙니다' });
                console.log('token error', { message: '토큰 타입이 Bearer 형식이 아닙니다' });
                socket.disconnect();
                return;
            }
            console.log('여기까지 와? 1번.');
            try {
                const decoded = jwt.verify(tokenValue, process.env.ACCESS_TOKEN_SECRET);
                const user = await prisma.users.findUnique({
                    where: {
                        userId: decoded.userId,
                    },
                });
                console.log('여기까지 와? 2번.');

                if (!user) {
                    socket.emit('error', { message: '인증 오류: 사용자를 찾을 수 없습니다.' });
                    socket.disconnect();
                    return;
                }
                console.log('여기까지 와? 3번.');

                // 유저 정보를 프론트엔드에게 전달
                socket.emit('userInfo', { userId: user.userId, username: user.nickname });
                console.log('userInfo', { userId: user.userId, username: user.nickname });

                // 유저 정보 설정
                socket.user = user; // 소켓 객체에 사용자 정보 추가
                userSockets[user.userId] = socket.id; // 사용자 ID와 소켓 ID 매핑
            } catch (error) {
                console.log('🚨🚨🚨비상비상 에러에러 4--0번.4--0번.');
                if (error.name === 'TokenExpiredError') {
                    console.log('🚨🚨🚨비상비상 에러에러 4--1번.4--1번.', error.message);
                    console.error('인증 오류:', error);
                    socket.emit('error', { message: '인증 오류: ' + error.message });
                    socket.disconnect();
                } else {
                    console.log('🚨🚨🚨비상비상 에러에러 4--2번.4--2번.', error.message);
                    console.error('기타 에러 발생:', error);
                    socket.emit('error', { message: '인증 오류: ' + error.message });
                    socket.disconnect();
                }
            }
        } else {
            // 토큰이 없는 경우 에러 처리
            console.log('🚨🚨🚨비상비상 에러에러 4--3번.4--3번.', error.message);
            console.error('error', error);
            socket.emit('error', { message: '인증 토큰이 없습니다.' });
            socket.disconnect();
        }
        console.log('여기까지 와? 5번.');

        // 채팅방 참여 로직 및 과거 메시지 처리
        socket.on('join room', async ({ roomId }) => {
            console.log('여기까지 와? 6번.');

            // 사용자 소켓이 특정 방에 입장할 때
            socket.join(roomId.toString(), () => {
                console.log(`User ${socket.id} joined room ${roomId}`);
                socket.emit('joined room', { roomId: roomId });
            });

            // 사용자 인증 확인 -> room 찾는 로직 밑에 두어야 더 좋은지 4.0한테 나중에 물어보기.
            if (!socket.user) {
                console.error('join room-socket.user error: Authentication failed');
                socket.emit('error', { message: '인증되지 않은 사용자입니다.' });
                return;
            }
            console.log('여기까지 와? 7번.');

            try {
                const room = await prisma.rooms.findUnique({
                    where: { roomId: parseInt(roomId) },
                });

                // 채팅방의 hasEntered를 true로 설정
                if (room && !room.hasEntered) {
                    await prisma.rooms.update({
                        where: { roomId: parseInt(roomId) },
                        data: { hasEntered: true },
                    });
                    console.log(`Room ${roomId} hasEntered flag set to true.`);
                }

                if (room) {
                    console.log('여기까지 와? 8번.');
                    console.log(`사용자가 방에 참가하였습니다: ${room.roomId}`);

                    userRooms[socket.id] = room.roomId; // 소켓 ID와 방 ID를 매핑하여 저장
                    // userRooms[socket.user.userId] = room.roomId; // Socket ID가 아닌 사용자의 ID를 키로 사용합니다.

                    // 방에 입장했다는 메시지를 방의 모든 참여자에게 전송
                    io.to(room.roomId.toString()).emit(
                        'room message',
                        `사용자 ${socket.user.userId} (Socket ID: ${socket.id})가 ${room.roomId || '채팅방'}에 입장했습니다.`,
                    );

                    // // API를 호출하여 과거 메시지를 가져옴
                    // const pastMessages = await axios.get(`/rooms/${roomId}`);
                    // // 클라이언트에게 과거 메시지 전송
                    // socket.emit('past messages', pastMessages.data);

                    // API를 호출하여 과거 메시지를 가져옴
                    const { data: pastMessages } = await axios.get(`/rooms/${roomId}`);
                    // 클라이언트에게 과거 메시지 전송
                    socket.emit('past messages', pastMessages);

                    console.log('여기까지 와? 8-2번.');
                } else {
                    console.error('비상비상 에러에러 9-1번.9-1번. >> 채팅방이 존재하지 않습니다.');
                    socket.emit('error', { message: '채팅방이 존재하지 않습니다.' });
                    socket.disconnect();
                }
            } catch (error) {
                console.error('비상비상 에러에러 9-2번.9-2번.', error);
                socket.emit('error', { message: '채팅방 참여 중 에러 발생.' });
                socket.disconnect();
            }
        });
        console.log('여기까지 와? 10번.');

        socket.on('chatting', async (data) => {
            console.log('여기까지 와? 11번.');
            console.log('Received data:', data); // 데이터 수신 확인 로그

            if (!socket.user) {
                console.error('chatting-socket.user error: 인증되지 않은 사용자입니다.');
                socket.emit('error', { message: '인증되지 않은 사용자입니다.' });
                return;
            }
            console.log('여기까지 와? 12번.');
            console.log('socket.user', socket.user);

            const roomId = userRooms[socket.id];
            // const roomId = userRooms[socket.user.userId];

            if (roomId) {
                console.log('여기까지 와? 13번.');
                try {
                    // if (typeof data === 'string') {
                    //     data = JSON.parse(data);
                    // }
                    // DB 저장용 한국 시간 포맷
                    const formattedDate = moment().tz('Asia/Seoul').format('YYYY-MM-DDTHH:mm:ssZ'); // 시간대 오프셋이 포함된 ISO-8601 형식
                    console.log('formattedDate', formattedDate);

                    // 채팅 메시지 데이터베이스에 저장
                    const newChat = await prisma.chattings.create({
                        data: {
                            text: data.msg,
                            roomId: parseInt(roomId),
                            senderId: socket.user.userId,
                            createdAt: formattedDate, // moment로 포맷된 시간 저장
                        },
                    });

                    console.log('New chat saved :', newChat);

                    // 클라이언트에 전송할 메시지 데이터 포맷팅
                    const timeForClient = moment(newChat.createdAt).tz('Asia/Seoul').format('HH:mm'); // 클라이언트 전송용 포맷

                    console.log(`Message sent in room ${roomId} by user ${socket.user.userId}: ${data.msg}`);

                    // 다른 소켓에게 메시지 전송
                    io.to(roomId).emit('message', {
                        chatId: newChat.chatId,
                        userId: socket.user.userId,
                        text: data.msg,
                        roomId: roomId,
                        time: timeForClient,
                    });
                    console.log('여기까지 와? 14번.');
                } catch (error) {
                    console.error('비상비상 에러에러 15-1번.15-1번.', error.message);
                    console.error(`Database error: ${error}`);
                    socket.emit('error', { message: '채팅 저장 중 에러 발생.' });
                }
            } else {
                console.error('비상비상 에러에러 15-2번.15-2번. >> 어떤 방에도 속해있지 않습니다.', error.message);
                console.log(`사용자 ${socket.user.userId}는 어떤 방에도 속해있지 않습니다.`);
            }
        });
        console.log('여기까지 와? 16번.');

        socket.on('leave room', () => {
            console.log('여기까지 와? 17번.');
            if (!socket.user) {
                socket.emit('error', { message: '인증되지 않은 사용자입니다.' });
                return;
            }

            const roomId = userRooms[socket.id];
            // const roomId = userRooms[socket.user.userId];

            if (roomId) {
                console.log('여기까지 와? 18번.');

                socket.leave(roomId.toString());
                socket.emit('leaved room', { roomId: roomId });
                io.to(roomId.toString()).emit(
                    'room message',
                    `사용자 ${socket.user.userId} (Socket ID: ${socket.id})가 방 ${roomId}에서 퇴장했습니다.`,
                );
                delete userRooms[socket.id];
                // delete userRooms[socket.user.userId];
            }
        });
        console.log('여기까지 와? 19번.');

        socket.on('disconnect', () => {
            console.log('여기까지 와? 20번.');
            console.log(`사용자 ${socket.id}가 연결을 해제했습니다.`);
            const roomId = userRooms[socket.id];
            // const roomId = userRooms[socket.user.userId];

            if (roomId) {
                io.to(roomId.toString()).emit(
                    'room message',
                    `사용자 ${socket.user.userId} (Socket ID: ${socket.id})가 방에서 퇴장했습니다.`,
                );
                delete userRooms[socket.id];
                // delete userRooms[socket.user.userId];

                // 해당 소켓이 과거 메시지 정보를 가지고 있다면 해당 정보 삭제
                // clearSocketPastMessages(socket.id);
                clearSocketPastMessages(socket.id, pastMessages);
            }
        });
    });
    return io; // 필요에 따라 io 객체 반환
};

export default initializeSocket;

//----------------------------------------------------------------------------------------
//         // 테스트 메시지를 주기적으로 전송하는 함수
//         function sendTestMessage() {
//             io.emit('chat message', '서버에서 보내는 테스트 메시지');
//             console.log('서버에서 테스트 메시지를 전송했습니다.');
//         }

//         // // 서버 상태 메시지를 주기적으로 전송하는 함수
//         // function broadcastServerStatus() {
//         //     const statusMessage = '현재 서버 상태는 양호합니다.';
//         //     io.emit('server status', statusMessage);
//         //     console.log('서버 상태 메시지를 전송했습니다.');
//         // }

//         // // 서버가 실행된 후 5초 후에 첫 메시지 전송, 그리고 10초마다 반복
//         // setTimeout(() => {
//         //     sendTestMessage();
//         //     setInterval(sendTestMessage, 10000);

//         //     // 서버 상태 메시지 전송 시작
//         //     broadcastServerStatus();
//         //     setInterval(broadcastServerStatus, 10000);
//         // }, 5000);

//         return io; // 필요에 따라 io 객체를 반환하여 외부에서 사용 가능하게 함
//     });
// };

// export default initializeSocket;
