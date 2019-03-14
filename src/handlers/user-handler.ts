import { Collection, Database } from '@frankmerema/abstract-database';
import { compare, hash } from 'bcrypt';
import { sign } from 'jsonwebtoken';
import { authenticator } from 'otplib';
import { toDataURL } from 'qrcode';
import { bindNodeCallback, from, Observable, of, throwError } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { UserModel, UserSchema } from '../model/user.model';

const config = require('../../service.config.json');

export class UserHandler {

    private userCollection: Collection<UserModel>;

    constructor() {
        const connection = new Database('localhost', 27017,
            config.database.name, config.database.config).getConnection();

        // const connection = new MongoAtlasDatabase(config.database.username, config.database.password,
        //     config.database.host, config.database.name, config.database.config).getConnection();

        this.userCollection = new Collection<UserModel>(connection, 'user', UserSchema, 'users');
    }

    getUser(username: string): Observable<UserModel> {
        return this.userCollection.findOne({username: username});
    }

    addUser(username: string, password: string): Observable<{ user: UserModel, token: string }> {
        if (!username || !password) {
            return throwError('Username and password are required!');
        }

        return this.userCollection.findOne({username: username})
            .pipe(switchMap(user => {
                if (!user) {
                    return from(hash(password, 12))
                        .pipe(switchMap(encryptedPassword => {
                            return this.userCollection.save(<UserModel>{
                                username: username,
                                password: encryptedPassword
                            }).pipe(
                                map(newUser => ({user: newUser, token: this.createJWT(newUser)})));
                        }));
                } else {
                    return throwError('User already exists');
                }
            }));
    }

    authenticateUser(username: string, password: string): Observable<{ user: UserModel, token: string }> {
        if (!username || !password) {
            return throwError('Username and password are required!');
        }

        return this.userCollection.findOne({username: username})
            .pipe(switchMap(user => {
                if (user) {
                    return from(compare(password, user.password))
                        .pipe(switchMap(success => {
                            if (success) {
                                return of({user: user, token: this.createJWT(user)});
                            } else {
                                return throwError('Username / Password incorrect');
                            }
                        }));
                } else {
                    return throwError('Username / Password incorrect');
                }
            }));
    }

    create2FactorAuthUrl(username: string): Observable<string> {
        const toDataUrl = bindNodeCallback(toDataURL);

        return this.userCollection
            .findOneAndUpdate({username: username}, {twoFactorAuthSecret: authenticator.generateSecret()}, {new: true})
            .pipe(switchMap(user => {
                    const otpAuthPath = authenticator.keyuri(encodeURIComponent(user.username), encodeURIComponent('Home-Bridge'), user.twoFactorAuthSecret);

                    return toDataUrl(otpAuthPath) as Observable<string>;
                })
            );
    }

    verify2FactorAuthCode(username: string, code: string): Observable<any> {
        return this.getUser(username)
            .pipe(map(user => ({verified: authenticator.check(code, user.twoFactorAuthSecret)})));
    }

    private createJWT(user: UserModel): string {
        return sign({username: user.username}, config.applicationSecret, {
            expiresIn: 3600
        });
    }
}
