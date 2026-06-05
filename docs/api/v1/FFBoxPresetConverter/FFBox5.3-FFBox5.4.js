function convert(data) {
	if (typeof data === 'string') {
		try {
			data = JSON.parse(data);
		} catch (error) {
			// TODO
		}
	}
	// TODO
	return data;
}
