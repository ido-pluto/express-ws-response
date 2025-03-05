export  class WSResponseAlreadyCloseError extends Error {
    constructor(message = 'You cannot send more anything after response has been closed') {
        super(message);
    }
}
