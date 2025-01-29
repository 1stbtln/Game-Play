import { v4 as uuidv4 } from 'uuid';
import { utils } from '../utils/utils.js';

export class SessionService {
    constructor() {
        this.currentSession = null;
    }

    startNewSession() {
        const sessionId = uuidv4().split('-')[0];
        this.currentSession = {
            id: sessionId,
            startTime: utils.formatTimestamp(new Date()),
            endTime: null
        };
        return this.currentSession;
    }

    endCurrentSession() {
        if (this.currentSession) {
            this.currentSession.endTime = utils.formatTimestamp(new Date());
            const session = { ...this.currentSession };
            this.currentSession = null;
            return session;
        }
        return null;
    }

    getCurrentSession() {
        return this.currentSession;
    }

    isSessionActive() {
        return this.currentSession !== null && !this.currentSession.endTime;
    }
}

export const sessionService = new SessionService();
