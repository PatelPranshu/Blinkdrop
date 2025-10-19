const validateInput = (req, res, next) => {
    const nameRegex = /^[A-Za-z0-9 ]+$/;
    const keyRegex = /^[A-Z0-9]{6}$/;
    const indexRegex = /^[0-9]+$/;

    const fieldsToValidate = {
        body: {
            senderName: nameRegex,
            receiverName: nameRegex,
            username: nameRegex,
            key: keyRegex,
        },
        params: {
            key: keyRegex,
            index: indexRegex,
            receiverName: nameRegex,
        },
    };

    for (const source in fieldsToValidate) {
        if (req[source]) {
            for (const field in fieldsToValidate[source]) {
                if (req[source][field]) {
                    const value = req[source][field];
                    const regex = fieldsToValidate[source][field];
                    if (!regex.test(value)) {
                        return res.status(400).json({ error: `Invalid input for field: ${field}` });
                    }
                }
            }
        }
    }
    next();
};

module.exports = validateInput;