import * as PresentService from './present.service.js';

// 마음에 드는 댓글에 선물 보내기
export const sendPresent = async (req, res, next) => {
    try {
        const { worryId, commentId } = req.params;
        const { userId } = req.body; // 로그인한 유저. 선물 보낼 사람
        // const userId = res.locals.user.userId;

        // 해당 고민 게시글 가져오기
        const worry = await PresentService.getWorryById(worryId);
        // 고민 등록 시 답변한 유저 아이디 가져오기. 선물 받을 사람
        const commentAuthorId = worry.commentAuthorId;

        const result = await PresentService.sendPresent(worryId, commentId, userId, commentAuthorId);

        console.log('🩵🩵🩵컨트롤러 : ', worryId, commentId, userId, commentAuthorId);

        return res.status(201).json({ result, message: '선물을 성공적으로 전달했습니다.' });
    } catch (error) {
        next(error);
    }
};

// '나의 해결된 고민' 목록 전체 조회
export const getSolvedWorries = async (req, res, next) => {
    try {
        const { userId } = req.body;
        // const { userId } = res.locals.user.userId;

        const solvedWorries = await PresentService.getSolvedWorriesByUserId(userId);
        return res.status(200).json(solvedWorries);
    } catch (error) {
        next(error);
    }
};

// '나의 해결된 고민' 상세 조회
export const getSolvedWorryDetails = async (req, res, next) => {
    try {
        const { worryId } = req.params;
        const worryDetails = await PresentService.getSolvedWorryDetailsById(parseInt(worryId));
        if (!worryDetails) {
            const err = new Error('해당하는 답변의 고민 게시글이 존재하지 않습니다.');
            err.status = 404;
            throw err;
        }
        return res.status(200).json(worryDetails);
    } catch (error) {
        next(error);
    }
};

// '내가 해결한 고민' 목록 전체 조회
export const getHelpedSolveWorries = async (req, res, next) => {
    try {
        const { userId } = req.body;
        // const { userId } = res.locals.user.userId;

        const helpedSolveWorries = await PresentService.getHelpedSolveWorriesByUserId(userId);
        res.status(200).json(helpedSolveWorries);
    } catch (error) {
        next(error);
    }
};

// '내가 해결한 고민' 상세 조회
export const getHelpedSolveWorryDetails = async (req, res, next) => {
    try {
        const { worryId } = req.params;
        const worryDetails = await PresentService.getHelpedSolveWorryDetailsById(parseInt(worryId));
        if (!worryDetails) {
            const err = new Error('해당하는 답변의 고민 게시글이 존재하지 않습니다.');
            err.status = 404;
            throw err;
        }
        return res.status(200).json(worryDetails);
    } catch (error) {
        next(error);
    }
};
