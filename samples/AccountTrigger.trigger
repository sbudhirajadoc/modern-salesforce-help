trigger AccountTrigger on Account (before insert, before update) {
    for (Account acc : Trigger.new) {
        if (acc.Name == null || acc.Name == '') {
            acc.Name.addError('Account Name is required.');
        }
        if (Trigger.isUpdate) {
            Account old = Trigger.oldMap.get(acc.Id);
            if (old.Name != acc.Name) {
                acc.Description = 'Name changed from: ' + old.Name;
            }
        }
    }
}
