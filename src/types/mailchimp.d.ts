declare module '@mailchimp/mailchimp_transactional' {
  type MailchimpTransactionalClient = (apiKey: string) => any;
  const mailchimpTransactional: MailchimpTransactionalClient;
  export default mailchimpTransactional;
}
