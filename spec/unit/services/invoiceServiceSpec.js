"use strict";

const specHelper = require("../../support/specHelper"),
    stripeHandler = require("../../../lib/stripeHandler"),
    models = specHelper.models,
    Invoice = models.Invoice,
    sinon = specHelper.sinon,
    Q = specHelper.Q,
    logger = specHelper.logger,
    moment = require('moment');

var invoiceService = require("../../../services/invoiceService");

describe('invoiceService', () => {
    let createInvoiceStub, updateInvoiceStub,
        newInvoiceloggerStub,
        updateInvoiceloggerStub, newInvoice,
        expectedInvoice, createInvoicePromise,
        updateInvoicePromise,
        createEmptyInvoiceloggerStub, memberEmail, reference;

    beforeEach(() => {
        createInvoiceStub = sinon.stub(models.Invoice, 'create');
        updateInvoiceStub = sinon.stub(models.Invoice, 'update');
        newInvoiceloggerStub = sinon.stub(logger, 'logNewInvoiceEvent');
        updateInvoiceloggerStub = sinon.stub(logger, 'logUpdateInvoiceEvent');
        createEmptyInvoiceloggerStub = sinon.stub(logger, 'logCreateEmptyInvoiceEvent');

        newInvoice = {
            totalAmount: 60,
            paymentType: "deposit",
            paymentDate: moment().format('L'),
            paymentStatus: "Pending",
            invoiceId: 1
        };

        expectedInvoice = {
            invoiceId: 1,
            reference: 'FUL1'
        };

        memberEmail = "sherlock@holmes.co.uk";
        reference = "FUL1234";

        createInvoicePromise = Q.defer();
        createInvoiceStub.returns(createInvoicePromise.promise);

        updateInvoicePromise = Q.defer();
        updateInvoiceStub.returns(updateInvoicePromise.promise);
    });

    afterEach(() => {
        models.Invoice.create.restore();
        models.Invoice.update.restore();
        newInvoiceloggerStub.restore();
        updateInvoiceloggerStub.restore();
        createEmptyInvoiceloggerStub.restore();
    });

    describe("create empty invoice", () => {
        let membershipType, createdEmptyInvoice,
            updatedInovice, emptyInvoice;


        beforeEach(() => {
            emptyInvoice = {
                memberEmail: memberEmail,
                totalAmountInCents: 0,
                paymentDate: moment().format('L'),
                paymentType: '',
                reference: ''
            };

            membershipType = "full";
            createdEmptyInvoice = {dataValues: {id: 1}};
            updatedInovice = {dataValues: expectedInvoice};
        });

        it ("with member email and membershipType, then update the reference", (done) => {
            createInvoicePromise.resolve(createdEmptyInvoice);
            updateInvoicePromise.resolve(updatedInovice);

            invoiceService.createEmptyInvoice(memberEmail, membershipType)
                .then((createdInvoice) => {
                    expect(createdInvoice.dataValues.id).toEqual(expectedInvoice.id);
                    expect(createdInvoice.dataValues.reference).toEqual(expectedInvoice.reference);

                    expect(Invoice.create).toHaveBeenCalledWith(emptyInvoice);
                    expect(Invoice.update).toHaveBeenCalledWith({ reference: 'FUL1' }, { where: {id: 1} });
                }).nodeify(done);
        });

        it("logs the create empty invoice event", (done) => {
            createInvoicePromise.resolve(createdEmptyInvoice);
            updateInvoicePromise.resolve(updatedInovice);

            invoiceService.createEmptyInvoice(memberEmail, membershipType)
                .finally(() => {
                    expect(logger.logCreateEmptyInvoiceEvent).toHaveBeenCalledWith(createdEmptyInvoice);
                    expect(logger.logUpdateInvoiceEvent).toHaveBeenCalledWith(1, {reference: 'FUL1'});
                }).nodeify(done);
        });

        it("rejects the promise when create empty invoice failed", (done) => {
            let errorMessage = "Seriously, we still don't have any damn bananas.";
            createInvoicePromise.reject(errorMessage);

            let promise = invoiceService.createEmptyInvoice(memberEmail, membershipType);

            promise.finally(() => {
                expect(promise.isRejected()).toBe(true);
                done();
            });
        });

        it("rejects the promise when update invoice failed", (done) => {
            let errorMessage = "Seriously, we still don't have any damn bananas.";
            createInvoicePromise.resolve(createdEmptyInvoice);
            updateInvoicePromise.reject(errorMessage);

            let promise = invoiceService.createEmptyInvoice(memberEmail, membershipType);

            promise.finally(() => {
                expect(promise.isRejected()).toBe(true);
                done();
            });
        });
    });

    describe("pay for invoice", () => {
        describe("Credit Card/Debit Card Payment", () => {
            let stripeHandlerStub, stripeChargePromise,
            stripeToken, totalAmount,
            loggerStub, failedLoggerStub;

            beforeEach(() => {
                newInvoice.paymentType = 'stripe';
                newInvoice.paymentStatus = 'PAID';
                newInvoice.transactionId = 'trans_1';
                newInvoice.stripeToken = 'token';

                stripeToken="47";
                totalAmount = 123;

                stripeHandlerStub = sinon.stub(stripeHandler, "chargeCard");
                stripeChargePromise = Q.defer();
                stripeHandlerStub.returns(stripeChargePromise.promise);

                loggerStub = sinon.stub(logger, 'logNewChargeEvent');
                failedLoggerStub = sinon.stub(logger, 'logNewFailedCharge');
            });

            afterEach(() => {
                stripeHandler.chargeCard.restore();
                loggerStub.restore();
                failedLoggerStub.restore();
            });

            it("should call charge card handler to charge the card", (done) => {
                stripeChargePromise.resolve();
                updateInvoicePromise.resolve({dataValues: expectedInvoice});

                invoiceService.payForInvoice(newInvoice)
                    .finally(() => {
                        expect(stripeHandler.chargeCard).toHaveBeenCalledWith(newInvoice.stripeToken, newInvoice.totalAmount);
                        done();
                    });
            });

            it("After charge, logger should log", (done) => {
                stripeChargePromise.resolve();
                updateInvoicePromise.resolve({dataValues: expectedInvoice});

                let promise = invoiceService.payForInvoice(newInvoice);

                promise.finally(() => {
                    expect(logger.logNewChargeEvent).toHaveBeenCalledWith(newInvoice.stripeToken);
                    expect(logger.logNewFailedCharge).not.toHaveBeenCalled();
                    done();
                });
            });

            it("If charge card fails, logger should log failed event", (done) => {
                let errorMessage = "Charge card failed with Stripe!";
                stripeChargePromise.reject(errorMessage);

                let promise = invoiceService.payForInvoice(newInvoice);

                promise.finally(() => {
                    expect(promise.isRejected()).toBe(true);
                    expect(logger.logNewFailedCharge).toHaveBeenCalledWith(newInvoice.stripeToken, errorMessage);
                    done();
                });
            });

            it ("update stripe reference with passed in values", (done) => {
                let invoice = {
                    totalAmountInCents: 6000,
                    paymentDate: moment().format('L'),
                    paymentType: 'stripe',
                    paymentStatus: 'PAID',
                    transactionId: 'trans_1'
                };

                stripeChargePromise.resolve({id:'trans_1'});
                updateInvoicePromise.resolve({dataValues: expectedInvoice});

                invoiceService.payForInvoice(newInvoice)
                    .then((updatedInvoice) => {
                        expect(updatedInvoice.dataValues.id).toEqual(expectedInvoice.id);
                        expect(updatedInvoice.dataValues.reference).toEqual(expectedInvoice.reference);

                        expect(Invoice.update).toHaveBeenCalledWith(invoice, {where: {id: 1}});
                    }).nodeify(done);
            });
        });

        describe("Direct debit, cheque, and no contribute payment", () => {
            it ("update the exisiting invoice", (done) => {
                let invoice = {
                    totalAmountInCents: 6000,
                    paymentDate: moment().format('L'),
                    paymentType: 'deposit',
                    paymentStatus: 'Pending'
                };

                updateInvoicePromise.resolve({dataValues: expectedInvoice});

                invoiceService.payForInvoice(newInvoice)
                    .then((updatedInvoice) => {
                        expect(updatedInvoice.dataValues.id).toEqual(expectedInvoice.id);
                        expect(updatedInvoice.dataValues.reference).toEqual(expectedInvoice.reference);

                        expect(Invoice.update).toHaveBeenCalledWith(invoice, {where: {id: 1}});
                    }).nodeify(done);
            });
        });

        it("logs update invoice event", (done) => {
            let invoice = {
                totalAmountInCents: 6000,
                paymentDate: moment().format('L'),
                paymentType: 'deposit',
                paymentStatus: 'Pending'
            };

            updateInvoicePromise.resolve({dataValues: expectedInvoice});

            invoiceService.payForInvoice(newInvoice)
                .finally(() => {
                    expect(logger.logUpdateInvoiceEvent).toHaveBeenCalledWith(1, invoice);
                }).nodeify(done);
        });

        it("rejects the promise when update invoice failed", (done) => {
            let errorMessage = "Seriously, we still don't have any damn bananas.";
            updateInvoicePromise.reject(errorMessage);

            let promise =  invoiceService.payForInvoice(newInvoice);

            promise.finally(() => {
                expect(promise.isRejected()).toBe(true);
                done();
            });
        });
    });

    describe('paypalChargeSuccess', () => {
        let updateLoggerStub, failedUpdateLoggerStub;

        beforeEach( () => {
            updateLoggerStub = sinon.stub(logger, 'logNewPaypalUpdate');
            failedUpdateLoggerStub = sinon.stub(logger, 'logNewFailedPaypalUpdate');
        });

        afterEach( () => {
            updateLoggerStub.restore();
            failedUpdateLoggerStub.restore();
        });

        it('should not call the error logger when finds matching invoice in db' , (done) => {
            updateInvoicePromise.resolve([1]);

            let promise = invoiceService.paypalChargeSuccess(23, 1);

            promise.finally(() => {
                expect(updateLoggerStub).toHaveBeenCalled();
                expect(failedUpdateLoggerStub).not.toHaveBeenCalled();
                expect(promise.isResolved()).toBe(true);
            }).nodeify(done);
        });

        it('should call the error logger when no matching invoice id in database' , (done) => {
            updateInvoicePromise.resolve([0]);

            let promise = invoiceService.paypalChargeSuccess(23, 1);

            promise.finally(() => {
                expect(updateLoggerStub).toHaveBeenCalled();
                expect(failedUpdateLoggerStub).toHaveBeenCalled();
                expect(promise.isRejected()).toBe(true);
            }).nodeify(done);
        });

        it('should call the error logger when no multiple matching invoice id in database' , (done) => {
            updateInvoicePromise.resolve([2]);

            let promise = invoiceService.paypalChargeSuccess(23, 1);

            promise.finally(() => {
                expect(updateLoggerStub).toHaveBeenCalled();
                expect(failedUpdateLoggerStub).toHaveBeenCalled();
                expect(promise.isRejected()).toBe(true);
            }).nodeify(done);
        });
      });
});




