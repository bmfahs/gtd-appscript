function runDbTest() {
  const data = DatabaseService.getAllDataPayload();
  console.log(JSON.stringify(data));
}
